import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, catchError, switchMap } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { Subject, BehaviorSubject, of } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { WorkflowService, WorkflowDto } from '../service/workflow.service';
import { WorkflowStateService } from '../service/workflow-state.service';
import { NotificationService } from '../service/notification.service';

interface WorkflowTab {
  label: string;
  route: string;
  path: string;
}

interface StepDef {
  path: string;
  label: string;
  enabledKey:   keyof WorkflowDto | null;
  completedKey: keyof WorkflowDto | null;
}

// Ordered prerequisite chain — each step is only checked when its enabledKey is true
const STEP_CHAIN: StepDef[] = [
  { path: 'list',             label: 'Workflow',         enabledKey: null,                   completedKey: null },
  { path: 'initial-enquiry',  label: 'Initial Enquiry',  enabledKey: 'initialEnquiry',       completedKey: 'initialEnquiryCompleted' },
  { path: 'create-quote',     label: 'Create Quote',     enabledKey: 'createQuotation',      completedKey: 'createQuotationCompleted' },
  { path: 'invite-showroom',  label: 'Invite Showroom',  enabledKey: 'inviteShowRoomVisit',  completedKey: 'inviteShowRoomCompleted' },
  { path: 'setup-site-visit', label: 'Setup Site Visit', enabledKey: 'setupSiteVisit',       completedKey: 'setupSiteVisitCompleted' },
  { path: 'final-quote',      label: 'Final Quote',      enabledKey: 'finalQuote',           completedKey: 'finalQuoteCompleted' },
  { path: 'invoice',          label: 'Invoice',          enabledKey: 'invoiceSent',          completedKey: 'invoiceSentCompleted' },
  { path: 'payment',          label: 'Payment',          enabledKey: null,                   completedKey: null },
];

@Component({
  selector: 'app-workflow',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.css']
})
export class WorkflowComponent implements OnInit, OnDestroy {
  activeTab     = 'list';
  customerName  = '';
  customerId: number | null = null;
  currentWorkflow: WorkflowDto | null = null;

  private _allParams: Record<string, any> = {};
  private destroy$ = new Subject<void>();
  private loadTrigger$ = new BehaviorSubject<{ workflowId: number; customerId: number } | null>(null);

  tabs: WorkflowTab[] = [
    { label: 'Workflow',         route: '/workflow/list',             path: 'list'             },
    { label: 'Initial Enquiry',  route: '/workflow/initial-enquiry',  path: 'initial-enquiry'  },
    { label: 'Create Quote',     route: '/workflow/create-quote',     path: 'create-quote'     },
    { label: 'Invite Showroom',  route: '/workflow/invite-showroom',  path: 'invite-showroom'  },
    { label: 'Setup Site Visit', route: '/workflow/setup-site-visit', path: 'setup-site-visit' },
    { label: 'Final Quote',      route: '/workflow/final-quote',      path: 'final-quote'      },
    { label: 'Invoice',          route: '/workflow/invoice',          path: 'invoice'          },
    { label: 'Payment',          route: '/workflow/payment',          path: 'payment'          },
  ];

  constructor(
    private router:               Router,
    private route:                ActivatedRoute,
    private workflowService:      WorkflowService,
    private workflowStateService: WorkflowStateService,
    private notificationService:  NotificationService
  ) {}

  ngOnInit(): void {
    // Reload workflow when workflowId changes (switchMap cancels stale requests)
    this.loadTrigger$.pipe(
      filter(v => v !== null),
      switchMap(v => this.workflowService.getWorkflowsForCustomer(v!.customerId).pipe(
        catchError(() => of([] as WorkflowDto[]))
      )),
      takeUntil(this.destroy$)
    ).subscribe(workflows => {
      const id = this.loadTrigger$.value?.workflowId;
      this.currentWorkflow = id ? (workflows.find(w => w.workflowId === id) ?? null) : null;
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this._allParams   = { ...this._allParams, ...params };
      this.customerId   = params['customerId']   ? +params['customerId']   : this.customerId;
      this.customerName = params['customerName'] || this.customerName || 'Customers';
      this.triggerWorkflowLoad();
    });

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      const qp = this.router.parseUrl(this.router.url).queryParams;
      if (Object.keys(qp).length) {
        this._allParams = { ...this._allParams, ...qp };
        if (qp['customerId'])   this.customerId   = +qp['customerId'];
        if (qp['customerName']) this.customerName = qp['customerName'];
        this.triggerWorkflowLoad();
      }
      this.updateActiveTab();
    });

    // After any step is saved, reload workflow status and advance to next tab
    this.workflowStateService.stepCompleted$.pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        const v = this.loadTrigger$.value;
        if (!v) return of([] as WorkflowDto[]);
        return this.workflowService.getWorkflowsForCustomer(v.customerId).pipe(
          catchError(() => of([] as WorkflowDto[]))
        );
      })
    ).subscribe(workflows => {
      const id = this.loadTrigger$.value?.workflowId;
      if (id) this.currentWorkflow = workflows.find(w => w.workflowId === id) ?? null;
      this.navigateToNextAvailableTab();
    });

    // After any record is deleted, reload workflow status (no auto-navigate)
    this.workflowStateService.workflowChanged$.pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        const v = this.loadTrigger$.value;
        if (!v) return of([] as WorkflowDto[]);
        return this.workflowService.getWorkflowsForCustomer(v.customerId).pipe(
          catchError(() => of([] as WorkflowDto[]))
        );
      })
    ).subscribe(workflows => {
      const id = this.loadTrigger$.value?.workflowId;
      if (id) this.currentWorkflow = workflows.find(w => w.workflowId === id) ?? null;
    });

    this.updateActiveTab();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private triggerWorkflowLoad(): void {
    const workflowId = this._allParams['workflowId'] ? +this._allParams['workflowId'] : null;
    if (workflowId && this.customerId) {
      const cur = this.loadTrigger$.value;
      if (!cur || cur.workflowId !== workflowId || cur.customerId !== this.customerId) {
        this.loadTrigger$.next({ workflowId, customerId: this.customerId });
      }
    } else {
      this.currentWorkflow = null;
    }
  }

  // Returns the label of the first incomplete prerequisite, or null if the tab is accessible
  getBlockingStep(targetPath: string): string | null {
    if (targetPath === 'list') return null;

    if (!this._allParams['workflowId']) {
      return 'Workflow (select a workflow first)';
    }

    if (!this.currentWorkflow) return null;  // data not yet loaded — allow optimistically

    const targetIndex = STEP_CHAIN.findIndex(s => s.path === targetPath);
    if (targetIndex <= 0) return null;

    for (let i = 1; i < targetIndex; i++) {
      const step = STEP_CHAIN[i];
      // Skip steps that are not enabled in this workflow
      if (step.enabledKey && !this.currentWorkflow[step.enabledKey]) continue;
      // Block if this enabled step isn't completed yet
      if (step.completedKey && !this.currentWorkflow[step.completedKey as keyof WorkflowDto]) {
        return step.label;
      }
    }
    return null;
  }

  isTabLocked(tab: WorkflowTab): boolean {
    return this.getBlockingStep(tab.path) !== null;
  }

  isTabCompleted(tab: WorkflowTab): boolean {
    if (!this.currentWorkflow) return false;
    const step = STEP_CHAIN.find(s => s.path === tab.path);
    if (!step?.completedKey) return false;
    return !!this.currentWorkflow[step.completedKey as keyof WorkflowDto];
  }

  updateActiveTab(): void {
    const currentUrl = this.router.url;
    const found = this.tabs.find(tab => currentUrl.includes(tab.path));
    if (found) this.activeTab = found.path;
  }

  private navigateToNextAvailableTab(): void {
    const currentIndex = STEP_CHAIN.findIndex(s => s.path === this.activeTab);
    for (let i = currentIndex + 1; i < STEP_CHAIN.length; i++) {
      const stepDef = STEP_CHAIN[i];
      const tab = this.tabs.find(t => t.path === stepDef.path);
      if (!tab) continue;
      if (!this.getBlockingStep(stepDef.path)) {
        this.activeTab = stepDef.path;
        this.router.navigate([tab.route], { queryParams: this._allParams });
        return;
      }
    }
  }

  navigateToTab(tab: WorkflowTab): void {
    const blocking = this.getBlockingStep(tab.path);
    if (blocking) {
      this.notificationService.error(
        `Please complete "${blocking}" before proceeding to "${tab.label}".`
      );
      return;
    }
    this.activeTab = tab.path;
    this.router.navigate([tab.route], { queryParams: this._allParams });
  }

  isActive(tabPath: string): boolean {
    return this.activeTab === tabPath;
  }

  goBackToCustomers(): void {
    this.router.navigate(['/customers']);
  }
}
