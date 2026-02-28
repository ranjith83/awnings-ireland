import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {  EmailTask, User, PaginatedResponse, PageInfo, CustomerExistsResponse, ExtractedCustomerData, EmailTaskService } from '../service/email-task.service';
import { WorkflowService, WorkflowDto } from '../service/workflow.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, BehaviorSubject, combineLatest, of, Subject } from 'rxjs';
import { map, switchMap, catchError, shareReplay, tap, take, filter, takeUntil } from 'rxjs/operators';
import { Router, NavigationEnd } from '@angular/router';

export interface EmailAttachment {
  attachmentId: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  blobUrl: string;
}

/**
 * Local extension of the service EmailTask type.
 * Adds fields that come from the API but are not yet in the shared interface.
 * Add quoteId and workflowId to EmailTask in email-task.service.ts to remove this.
 */
export interface EmailTaskExtended extends EmailTask {
  quoteId?: number | null;
  workflowId?: number | null;
}

type WorkflowGuardResult =
  | { ok: true; workflowId: number }
  | { ok: false; reason: 'no_customer' | 'no_workflow' | 'loading_error' };

@Component({
  selector: 'app-email-tasks',
  templateUrl: './email-task.component.html',
  standalone: true,
  imports: [FormsModule, CommonModule],
  styleUrls: ['./email-task.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmailTaskComponent implements OnInit, OnDestroy {
  private isBrowser: boolean;
  private destroy$ = new Subject<void>();

  // ── tracks the route we navigated away to so we know when to refresh on return
  private pendingRefreshOnReturn = false;

  // ── tracks the task that triggered a workflow creation so we can link on return
  private _pendingWorkflowLinkTask: {
    taskId: number;
    category: string;
    incomingEmailId: number;
  } | null = null;

  // ==================== REACTIVE STATE ====================
  private activeTabSubject       = new BehaviorSubject<'tasks' | 'in-progress' | 'completed' | 'junk'>('tasks');
  private currentPageSubject     = new BehaviorSubject<number>(1);
  private pageSizeSubject        = new BehaviorSubject<number>(20);
  private searchTermSubject      = new BehaviorSubject<string>('');
  private sortBySubject          = new BehaviorSubject<string>('DateAdded');
  private sortDirectionSubject   = new BehaviorSubject<'ASC' | 'DESC'>('DESC');
  private filterPrioritySubject  = new BehaviorSubject<string>('');
  private filterAssignedUserSubject = new BehaviorSubject<number | null>(null);
  private refreshTrigger         = new BehaviorSubject<void>(undefined);

  activeTab$          = this.activeTabSubject.asObservable() as Observable<'tasks' | 'in-progress' | 'completed' | 'junk'>;
  currentPage$        = this.currentPageSubject.asObservable();
  pageSize$           = this.pageSizeSubject.asObservable();
  searchTerm$         = this.searchTermSubject.asObservable();
  filterPriority$     = this.filterPrioritySubject.asObservable();
  filterAssignedUser$ = this.filterAssignedUserSubject.asObservable();

  private filters$ = combineLatest([
    this.activeTabSubject, this.currentPageSubject, this.pageSizeSubject,
    this.searchTermSubject, this.sortBySubject, this.sortDirectionSubject,
    this.filterPrioritySubject, this.filterAssignedUserSubject, this.refreshTrigger
  ]).pipe(
    map(([activeTab, page, pageSize, searchTerm, sortBy, sortDirection, priority, assignedUser]) => ({
      status: this.getStatusFromTab(activeTab),
      statuses: this.getStatusesFromTab(activeTab),
      page, pageSize, sortBy, sortDirection,
      searchTerm: searchTerm || undefined,
      priority: priority || undefined,
      assignedToUserId: assignedUser || undefined
    }))
  );

  private tasksResponse$!: Observable<PaginatedResponse<EmailTaskExtended>>;
  tasks$!:       Observable<EmailTaskExtended[]>;
  pageInfo$!:    Observable<PageInfo>;
  totalItems$!:  Observable<number>;
  totalPages$!:  Observable<number>;
  pageNumbers$!: Observable<number[]>;

  isLoading$    = new BehaviorSubject<boolean>(false);
  users$!:       Observable<User[]>;
  currentUser$!: Observable<User | null>;

  // ==================== EMAIL VIEWER STATE ====================
  selectedTask:     EmailTaskExtended | null = null;
  showEmailViewer:  boolean = false;
  activeEmailTab:   'email' | 'attachments' | 'send-email' = 'email';
  selectedAssignee: number | null = null;
  selectedAction:   string = '';
  selectedStatus:   string = '';   // bound to the Status dropdown in the viewer

  /** Status options shown in the viewer dropdown */
  readonly statusOptions = [
    { value: 'New',         label: 'New' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'More Info',   label: 'More Info' },
    { value: 'Closed',      label: 'Closed' },
    { value: 'Reopened',    label: 'Reopened' },
    { value: 'Completed',   label: 'Completed' },
  ];

  // Current user context resolved at startup
  currentUserId: number | null = null;
  isAdmin: boolean = false;

  // ── Send Email tab state ────────────────────────────────────────────────────
  sendEmailSubject:  string = '';
  sendEmailBody:     string = '';
  isSendingEmail:    boolean = false;
  sendEmailSuccess:  string = '';
  sendEmailError:    string = '';

  // Workflow guard UI
  workflowCheckInProgress:  boolean       = false;
  showNoWorkflowBanner:     boolean       = false;
  workflowMissingForAction: string        = '';

  // Populated eagerly when the viewer opens — null = not yet checked
  workflowExists:      boolean | null = null;
  existingWorkflowId:  number  | null = null;
  existingWorkflowName: string | null = null;   // ← shown as link when workflow already exists

  // ── Toast notification ─────────────────────────────────────────────────────
  toast: { visible: boolean; type: 'success' | 'error' | 'warning'; message: string } = {
    visible: false, type: 'success', message: ''
  };
  private toastTimer: any = null;

  showToast(type: 'success' | 'error' | 'warning', message: string, durationMs = 4000): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { visible: true, type, message };
    // ── OnPush fix: mutations outside zone / after viewer close need explicit marking ──
    this.cdr.markForCheck();
    this.toastTimer = setTimeout(() => {
      this.toast = { ...this.toast, visible: false };
      this.cdr.markForCheck();
    }, durationMs);
  }

  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { ...this.toast, visible: false };
    this.cdr.markForCheck();
  }

  // ── Category → action permissions ──────────────────────────────────────────
  // Controls which Quick Action buttons are ENABLED for each email category.
  readonly categoryPermissions: Record<string, {
    canGenerateQuote:   boolean;
    canGenerateInvoice: boolean;
    canAddSiteVisit:    boolean;
    canCreateWorkflow:  boolean;
  }> = {
    // Quote explicitly requested
    quote_creation: {
      canGenerateQuote:   true,
      canGenerateInvoice: false,
      canAddSiteVisit:    false,
      canCreateWorkflow:  true
    },
    // Invoice is due — quote may also be needed
    invoice_due: {
      canGenerateQuote:   true,
      canGenerateInvoice: true,
      canAddSiteVisit:    false,
      canCreateWorkflow:  true
    },
    // Site visit / meeting requested
    site_visit_meeting: {
      canGenerateQuote:   false,
      canGenerateInvoice: false,
      canAddSiteVisit:    true,
      canCreateWorkflow:  true
    },
    // New general enquiry — everything is fair game
    initial_enquiry: {
      canGenerateQuote:   true,
      canGenerateInvoice: true,
      canAddSiteVisit:    true,
      canCreateWorkflow:  true
    },
    general_inquiry: {
      canGenerateQuote:   true,
      canGenerateInvoice: true,
      canAddSiteVisit:    true,
      canCreateWorkflow:  true
    },
    // Showroom booking — next step is usually a quote
    showroom_booking: {
      canGenerateQuote:   true,
      canGenerateInvoice: false,
      canAddSiteVisit:    false,
      canCreateWorkflow:  true
    },
    // Complaint — no transactional actions
    complaint: {
      canGenerateQuote:   false,
      canGenerateInvoice: false,
      canAddSiteVisit:    false,
      canCreateWorkflow:  false
    },
    // Junk — nothing enabled
    junk: {
      canGenerateQuote:   false,
      canGenerateInvoice: false,
      canAddSiteVisit:    false,
      canCreateWorkflow:  false
    }
  };

  /** Returns the permission set for the current task's category. */
  get categoryPerms() {
    const cat = this.selectedTask?.category ?? '';
    return this.categoryPermissions[cat] ?? {
      // Default: allow everything for unknown categories
      canGenerateQuote: true, canGenerateInvoice: true,
      canAddSiteVisit: true,  canCreateWorkflow: true
    };
  }

  // ── Visibility: show button only if category permits it ────────────────────
  get showQuoteBtn():     boolean { return this.categoryPerms.canGenerateQuote;   }
  get showInvoiceBtn():   boolean { return this.categoryPerms.canGenerateInvoice; }
  get showSiteVisitBtn(): boolean { return this.categoryPerms.canAddSiteVisit;    }
  get showWorkflowBtn():  boolean { return this.categoryPerms.canCreateWorkflow;  }

  // ── Enabled state ───────────────────────────────────────────────────────────
  // Quote / Invoice / Site Visit require: customer + workflow exists
  // Workflow button requires: customer only (it IS the creation action)
  get canQuote():      boolean { return !!this.selectedTask?.customerId && this.workflowExists === true; }
  get canInvoice():    boolean { return !!this.selectedTask?.customerId && this.workflowExists === true; }
  get canSiteVisit():  boolean { return !!this.selectedTask?.customerId && this.workflowExists === true; }
  get canWorkflow():   boolean { return !!this.selectedTask?.customerId && this.workflowExists !== true; }

  // Tooltip helpers
  get noCustomerTip():  string { return 'Create a customer for this email first'; }
  get noWorkflowTip():  string { return 'No workflow yet — click Create Workflow first'; }
  get workflowDoneTip():string { return 'Workflow already exists for this customer'; }

  pageSizeOptions: number[] = [10, 20, 50, 100];
  today: Date = new Date();
  Math = Math;

  showCustomerModal:      boolean = false;
  extractedCustomerData:  ExtractedCustomerData | null = null;
  customerExistsInfo:     CustomerExistsResponse | null = null;

  availableActions = [
    { value: 'add_company',      label: 'Add Company' },
    { value: 'generate_quote',   label: 'Generate Quote' },
    { value: 'generate_invoice', label: 'Generate Invoice' },
    { value: 'add_site_visit',   label: 'Add Site Visit' },
    { value: 'create_workflow',  label: 'Create Workflow' },
    { value: 'move_to_junk',     label: 'Move to Junk' }
  ];

  constructor(
    private emailTaskService: EmailTaskService,
    private workflowService:  WorkflowService,
    private router:           Router,
    private cdr:              ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.initializeDataStreams();

    // ── Auto-refresh grid when navigating back from /customers or /workflow ──────
    // This handles: "Customer Created" and "Workflow Created" returning to the task list.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((e: any) => {
      const url: string = e.urlAfterRedirects ?? e.url ?? '';
      // We came back to the tasks page
      if (url.includes('/email-tasks') || url === '/') {
        if (this.pendingRefreshOnReturn) {
          this.pendingRefreshOnReturn = false;
          this.refreshTrigger.next();
          this.cdr.markForCheck();
        }

        // If the user just returned from creating a workflow for an initial_enquiry
        // task, link the newest workflow for that customer back to the task so
        // EmailTask.WorkflowId is set. The InitialEnquiry record was already created
        // on the backend when CreateWorkflow was called with the taskId.
        if (this._pendingWorkflowLinkTask) {
          this._tryLinkNewestWorkflowToTask(this._pendingWorkflowLinkTask);
          this._pendingWorkflowLinkTask = null;
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private initializeDataStreams(): void {
    this.tasksResponse$ = this.filters$.pipe(
      switchMap(filters =>
        this.emailTaskService.getTasksPaginated(filters).pipe(
          catchError(() => of({ tasks: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 }))
        )
      ),
      shareReplay(1)
    );

    this.tasks$       = this.tasksResponse$.pipe(map(r => r.tasks));
    this.pageInfo$    = this.tasksResponse$.pipe(map(r => this.emailTaskService.getPageInfo(r)));
    this.totalItems$  = this.tasksResponse$.pipe(map(r => r.totalCount));
    this.totalPages$  = this.tasksResponse$.pipe(map(r => r.totalPages));
    this.pageNumbers$ = combineLatest([this.currentPageSubject, this.totalPages$]).pipe(
      map(([cp, tp]) => this.calculatePageNumbers(cp, tp))
    );

    this.users$       = this.emailTaskService.getUsers().pipe(catchError(() => of([])), shareReplay(1));
    this.currentUser$ = this.emailTaskService.getCurrentUser().pipe(catchError(() => of(null)), shareReplay(1));

    // Resolve current user role once at startup for role-based visibility
    this.currentUser$.pipe(take(1)).subscribe(user => {
      if (user) {
        this.currentUserId = (user as any).userId ?? null;
        this.isAdmin = (user as any).role === 'Admin';
        this.cdr.markForCheck();
      }
    });
  }

  // ==================== PAGINATION ====================

  setActiveTab(tab: 'tasks' | 'in-progress' | 'completed' | 'junk'): void {
    this.activeTabSubject.next(tab);
    this.currentPageSubject.next(1);
  }

  goToPage(page: number): void { this.currentPageSubject.next(page); }

  nextPage(): void {
    this.totalPages$.pipe(take(1)).subscribe(tp => {
      if (this.currentPageSubject.value < tp) this.currentPageSubject.next(this.currentPageSubject.value + 1);
    });
  }

  previousPage(): void {
    if (this.currentPageSubject.value > 1) this.currentPageSubject.next(this.currentPageSubject.value - 1);
  }

  firstPage(): void { this.currentPageSubject.next(1); }

  lastPage(): void {
    this.totalPages$.pipe(take(1)).subscribe(tp => this.currentPageSubject.next(tp));
  }

  changePageSize(newSize: number): void {
    this.pageSizeSubject.next(newSize);
    this.currentPageSubject.next(1);
  }

  applySearch(): void { this.currentPageSubject.next(1); this.refreshTrigger.next(); }
  clearSearch(): void { this.searchTermSubject.next(''); this.currentPageSubject.next(1); }
  applyFilters(): void { this.currentPageSubject.next(1); this.refreshTrigger.next(); }

  clearFilters(): void {
    this.filterPrioritySubject.next('');
    this.filterAssignedUserSubject.next(null);
    this.currentPageSubject.next(1);
  }

  sortByColumn(column: string): void {
    if (this.sortBySubject.value === column) {
      this.sortDirectionSubject.next(this.sortDirectionSubject.value === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.sortBySubject.next(column);
      this.sortDirectionSubject.next('DESC');
    }
  }

  getSortIndicator(column: string): string {
    if (this.sortBySubject.value !== column) return '';
    return this.sortDirectionSubject.value === 'ASC' ? '↑' : '↓';
  }

  updateSearchTerm(term: string): void { this.searchTermSubject.next(term); }
  updateFilterPriority(p: string): void { this.filterPrioritySubject.next(p); }
  updateFilterAssignedUser(id: number | null): void { this.filterAssignedUserSubject.next(id); }

  // ==================== EMAIL VIEWER ====================

  onRowDoubleClick(task: EmailTaskExtended): void {
    this.selectedTask            = task;
    this.showEmailViewer         = true;
    this.activeEmailTab          = 'email';
    this.selectedAssignee        = task.assignedToUserId ?? null;
    this.selectedStatus          = task.status ?? 'New';
    this.showNoWorkflowBanner    = false;
    this.workflowMissingForAction = '';

    // Pre-set from task data so the button state is correct before the API responds.
    // loadWorkflowStatus() will refine these values asynchronously.
    if (task.workflowId) {
      this.workflowExists     = true;
      this.existingWorkflowId = task.workflowId;
      this.existingWorkflowName = null;   // name resolved async by loadWorkflowStatus
    } else {
      this.workflowExists     = null;   // unknown — will be set by loadWorkflowStatus
      this.existingWorkflowId = null;
      this.existingWorkflowName = null;
    }

    // Eagerly check workflow existence so buttons reflect real state immediately
    this.loadWorkflowStatus(task);
  }

  /**
   * Checks whether this customer has any workflow and caches the result.
   * Called automatically when the viewer opens — no spinner needed (silent check).
   *
   * Fast path: if the task already has a workflowId we set workflowExists = true
   * immediately so the "Create Workflow" button is disabled without waiting for
   * the API response. The async call still runs to populate existingWorkflowName.
   */
  private loadWorkflowStatus(task: EmailTaskExtended): void {
    if (!task.customerId) {
      this.workflowExists    = false;
      this.existingWorkflowId = null;
      this.cdr.markForCheck();
      return;
    }

    // ── Fast-path: task already has a linked workflowId ────────────────────
    // Disable the button immediately — don't wait for the API round-trip.
    if (task.workflowId) {
      this.workflowExists     = true;
      this.existingWorkflowId = task.workflowId;
      this.cdr.markForCheck();  // re-render NOW so button disables instantly
    }

    // Still fetch from API to get the workflow name (for the clickable link)
    // and to verify / correct the cached value.
    this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(
      take(1),
      catchError(() => of([] as WorkflowDto[]))
    ).subscribe(workflows => {
      if (!workflows || workflows.length === 0) {
        this.workflowExists     = false;
        this.existingWorkflowId = null;
        this.existingWorkflowName = null;
      } else {
        const matched = task.workflowId
          ? workflows.find(w => w.workflowId === task.workflowId) ?? workflows[0]
          : workflows[0];
        this.workflowExists       = true;
        this.existingWorkflowId   = matched.workflowId;
        this.existingWorkflowName = matched.workflowName || matched.productName || `Workflow #${matched.workflowId}`;
      }
      // ── Critical for OnPush: tell Angular this component has changed ──────
      this.cdr.markForCheck();
    });
  }

  closeEmailViewer(): void {
    this.showEmailViewer          = false;
    this.selectedTask             = null;
    this.selectedAction           = '';
    this.selectedAssignee         = null;
    this.selectedStatus           = '';
    this.showNoWorkflowBanner     = false;
    this.workflowMissingForAction = '';
    this.workflowExists           = null;
    this.existingWorkflowId       = null;
    this.existingWorkflowName     = null;
    this.clearSendEmail();
  }

  setEmailTab(tab: 'email' | 'attachments' | 'send-email'): void {
    this.activeEmailTab = tab;
    if (tab === 'send-email') this.prefillReply();
  }

  /** Pre-fills Subject with Re: when the send-email tab opens. */
  private prefillReply(): void {
    if (!this.selectedTask) return;
    if (!this.sendEmailSubject) {
      this.sendEmailSubject = `Re: ${this.selectedTask.subject ?? ''}`;
    }
  }

  /** Calls POST /api/EmailTask/{taskId}/send-email */
  sendEmail(): void {
    if (!this.selectedTask) return;
    if (!this.sendEmailBody.trim()) {
      this.sendEmailError = 'Please enter a message body.';
      this.cdr.markForCheck();
      return;
    }

    this.isSendingEmail = true;
    this.sendEmailError   = '';
    this.sendEmailSuccess = '';
    this.cdr.markForCheck();

    const taskId = this.selectedTask.taskId;
    const payload = {
      toEmail:              this.selectedTask.fromEmail,
      toName:               this.selectedTask.fromName,
      subject:              this.sendEmailSubject,
      body:                 this.sendEmailBody,
      originalEmailGraphId: (this.selectedTask as any).emailGraphId ?? null
    };

    this.emailTaskService.sendTaskEmail(taskId, payload)
      .subscribe({
        next: () => {
          this.isSendingEmail = false;
          // 1. Close the dialog — clears selectedTask etc.
          this.closeEmailViewer();
          // 2. Refresh the grid
          this.refreshTrigger.next();
          // 3. Show toast — markForCheck called inside showToast so OnPush picks it up
          this.showToast('success', 'Email sent successfully!');
        },
        error: (err) => {
          this.isSendingEmail = false;
          this.sendEmailError = err?.error?.error ?? 'Failed to send email. Please try again.';
          this.showToast('error', this.sendEmailError);
        }
      });
  }

  clearSendEmail(): void {
    this.sendEmailSubject  = '';
    this.sendEmailBody     = '';
    this.sendEmailError    = '';
    this.sendEmailSuccess  = '';
  }

  save(): void {
    if (!this.selectedTask) return;

    const task         = this.selectedTask;
    const isAssigning  = this.selectedAssignee !== null && this.selectedAssignee !== task.assignedToUserId;
    const isUnassigning= this.selectedAssignee === null && task.assignedToUserId !== null;
    const isSameUser   = this.selectedAssignee !== null && this.selectedAssignee === task.assignedToUserId;

    const isStatusChange = this.selectedStatus && this.selectedStatus !== task.status;

    // Block if user tries to assign to the same person already assigned
    if (isSameUser && !this.selectedAction && !isStatusChange) {
      const userName = task.assignedTo ?? 'this user';
      this.showToast('warning', `Task is already assigned to ${userName}. No changes made.`);
      return;
    }

    const promises: Promise<any>[] = [];

    if (isAssigning) {
      promises.push(
        this.emailTaskService.assignTask(task.taskId, this.selectedAssignee!).toPromise()
      );
    } else if (isUnassigning) {
      promises.push(
        this.emailTaskService.unassignTask(task.taskId).toPromise()
      );
    }

    // Handle status change (if not already covered by assignment backend logic)
    if (isStatusChange && !isAssigning) {
      // Calls PUT /api/EmailTask/{taskId}/status — add updateTaskStatus() to EmailTaskService if not present
      promises.push(
        this.emailTaskService.updateTaskStatus(task.taskId, this.selectedStatus).toPromise()
      );
    }

    // Execute dropdown action — navigation actions are handled exclusively by their
    // own Quick Action buttons and must NOT be re-triggered here.
    const navigationActions = new Set(['generate_quote', 'generate_invoice', 'add_site_visit', 'create_workflow']);
    if (this.selectedAction && !navigationActions.has(this.selectedAction)) {
      promises.push(
        this.emailTaskService.executeAction(task.taskId, this.selectedAction).toPromise()
      );
    }

    if (promises.length === 0) {
      this.closeEmailViewer();
      return;
    }

    Promise.all(promises)
      .then(() => {
        if (isAssigning) {
          // Assigning sets status → Processed on the backend.
          // Close viewer, refresh, show toast, then switch tab.
          this.closeEmailViewer();
          this.refreshTrigger.next();
          this.showToast('success', `Task assigned successfully and moved to In Progress.`);
          setTimeout(() => {
            this.setActiveTab('in-progress');
            this.cdr.markForCheck();
          }, 600);
        } else if (isStatusChange && (this.selectedStatus === 'Completed' || this.selectedStatus === 'Closed')) {
          this.closeEmailViewer();
          this.refreshTrigger.next();
          this.showToast('success', `Task marked as ${this.selectedStatus}.`);
          setTimeout(() => {
            this.setActiveTab('completed');
            this.cdr.markForCheck();
          }, 600);
        } else {
          this.closeEmailViewer();
          this.refreshTrigger.next();
        }
      })
      .catch(err => {
        console.error('❌ Save error:', err);
        this.showToast('error', `Failed to save: ${err?.message ?? 'Unknown error'}. Please try again.`);
      });
  }

  downloadAttachment(attachment: EmailAttachment): void {
    if (this.isBrowser && attachment.blobUrl) window.open(attachment.blobUrl, '_blank');
  }

  createNewTask(): void { console.log('Create new task'); }

  // ==================== WORKFLOW GUARD ====================

  /**
   * Checks whether the customer on this task has at least one workflow.
   * Prefers the workflowId already on the task; falls back to first workflow.
   */
  private checkWorkflowExists(task: EmailTaskExtended): Observable<WorkflowGuardResult> {
    if (!task.customerId) {
      return of({ ok: false, reason: 'no_customer' } as WorkflowGuardResult);
    }

    return this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(
      map((workflows: WorkflowDto[]) => {
        if (!workflows || workflows.length === 0) {
          return { ok: false, reason: 'no_workflow' } as WorkflowGuardResult;
        }
        const matched = task.workflowId
          ? workflows.find(w => w.workflowId === task.workflowId)
          : null;
        const chosen = matched ?? workflows[0];
        return { ok: true, workflowId: chosen.workflowId } as WorkflowGuardResult;
      }),
      catchError(() => of({ ok: false, reason: 'loading_error' } as WorkflowGuardResult))
    );
  }

  // ==================== ACTION HANDLERS ====================

  /** Navigate to the workflow list so the user can create one. */
  onCreateWorkflowClick(task: EmailTaskExtended): void {
    this.pendingRefreshOnReturn = true;   // refresh grid when user returns
    // Remember the task so we can link the new workflow back on return
    this._pendingWorkflowLinkTask = {
      taskId:           task.taskId,
      category:         task.taskType ?? task.category ?? '',
      incomingEmailId:  task.incomingEmailId
    };
    this.closeEmailViewer();
    this.router.navigate(['/workflow'], {
      queryParams: {
        customerId:    task.customerId   ?? null,
        customerName:  task.customerName ?? '',
        customerEmail: task.fromEmail    ?? '',   // ← pass sender email for Initial Enquiry pre-fill
        taskId:        task.taskId,
        mode:          'create'
      }
    });
  }

  /**
   * Navigate from the "Initial Enquiry" quick-action button to the
   * initial-enquiry screen for this task, pre-populating the customer email.
   */
  onInitialEnquiryClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }
    if (!this.existingWorkflowId) { this.workflowMissingForAction = 'initial_enquiry'; this.showNoWorkflowBanner = true; return; }
    this.closeEmailViewer();
    this.router.navigate(['/workflow/initial-enquiry'], {
      queryParams: {
        workflowId:    this.existingWorkflowId,
        customerId:    task.customerId,
        customerName:  task.customerName ?? '',
        customerEmail: task.fromEmail    ?? '',   // ← the task sender email
        taskId:        task.taskId,
        fromTask:      task.taskId               // breadcrumb hint
      }
    });
  }

  /** Navigate to the existing workflow page when the workflow name link is clicked. */
  navigateToExistingWorkflow(task: EmailTaskExtended): void {
    if (!task.customerId || !this.existingWorkflowId) return;
    this.closeEmailViewer();
    this.router.navigate(['/workflow'], {
      queryParams: {
        customerId:   task.customerId,
        customerName: task.customerName ?? '',
        workflowId:   this.existingWorkflowId
      }
    });
  }

  /**
   * Generate Quote.
   * Route: /workflow/create-quote?customerId=&customerName=&workflowId=
   * Workflow already checked on open — uses cached existingWorkflowId.
   */
  onGenerateQuoteClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }

    if (this.workflowExists === null) {
      // Still loading — re-check then navigate
      this.workflowCheckInProgress = true;
      this.checkWorkflowExists(task).subscribe(result => {
        this.workflowCheckInProgress = false;
        if (result.ok) { this.existingWorkflowId = result.workflowId; this.workflowExists = true; this._navToQuote(task, result.workflowId); }
        else { this.workflowMissingForAction = 'generate_quote'; this.showNoWorkflowBanner = true; }
      });
      return;
    }

    if (!this.workflowExists || !this.existingWorkflowId) {
      this.workflowMissingForAction = 'generate_quote';
      this.showNoWorkflowBanner = true;
      return;
    }
    this._navToQuote(task, this.existingWorkflowId);
  }

  private _navToQuote(task: EmailTaskExtended, workflowId: number): void {
    this.closeEmailViewer();
    this.router.navigate(['/workflow/create-quote'], {
      queryParams: { taskId: task.taskId, customerId: task.customerId, customerName: task.customerName ?? '', workflowId }
    });
  }

  /**
   * Generate Invoice.
   * Route: /workflow/invoice?customerId=&customerName=&workflowId=&quoteId=
   * If no quote yet: confirm-redirect to Create Quote.
   */
  onGenerateInvoiceClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }

    if (this.workflowExists === null) {
      this.workflowCheckInProgress = true;
      this.checkWorkflowExists(task).subscribe(result => {
        this.workflowCheckInProgress = false;
        if (result.ok) { this.existingWorkflowId = result.workflowId; this.workflowExists = true; this._navToInvoice(task, result.workflowId); }
        else { this.workflowMissingForAction = 'generate_invoice'; this.showNoWorkflowBanner = true; }
      });
      return;
    }

    if (!this.workflowExists || !this.existingWorkflowId) {
      this.workflowMissingForAction = 'generate_invoice';
      this.showNoWorkflowBanner = true;
      return;
    }
    this._navToInvoice(task, this.existingWorkflowId);
  }

  private _navToInvoice(task: EmailTaskExtended, workflowId: number): void {
    if (task.quoteId) {
      this.closeEmailViewer();
      this.router.navigate(['/workflow/invoice'], {
        queryParams: { taskId: task.taskId, customerId: task.customerId, customerName: task.customerName ?? '', workflowId, quoteId: task.quoteId }
      });
    } else {
      if (confirm('No quote has been generated for this task yet.\n\nClick OK to go to Generate Quote first.')) {
        this._navToQuote(task, workflowId);
      }
    }
  }

  /**
   * Add Site Visit.
   * Route: /workflow/setup-site-visit with email pre-fill params.
   */
  onAddSiteVisitClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }

    if (this.workflowExists === null) {
      this.workflowCheckInProgress = true;
      this.checkWorkflowExists(task).subscribe(result => {
        this.workflowCheckInProgress = false;
        if (result.ok) { this.existingWorkflowId = result.workflowId; this.workflowExists = true; this._navToSiteVisit(task, result.workflowId); }
        else { this.workflowMissingForAction = 'add_site_visit'; this.showNoWorkflowBanner = true; }
      });
      return;
    }

    if (!this.workflowExists || !this.existingWorkflowId) {
      this.workflowMissingForAction = 'add_site_visit';
      this.showNoWorkflowBanner = true;
      return;
    }
    this._navToSiteVisit(task, this.existingWorkflowId);
  }

  private _navToSiteVisit(task: EmailTaskExtended, workflowId: number): void {
    this.closeEmailViewer();
    this.router.navigate(['/workflow/setup-site-visit'], {
      queryParams: {
        taskId: task.taskId, customerId: task.customerId, customerName: task.customerName ?? '',
        workflowId, emailSubject: task.subject ?? '', emailBody: task.emailBody ?? '',
        fromName: task.fromName ?? '', fromEmail: task.fromEmail ?? '', mode: 'from-email'
      }
    });
  }

  /** "Create Workflow" button inside the no-workflow banner. */
  onCreateWorkflowFromBanner(): void {
    if (this.selectedTask) this.onCreateWorkflowClick(this.selectedTask);
  }

  dismissNoWorkflowBanner(): void {
    this.showNoWorkflowBanner = false;
    this.workflowMissingForAction = '';
  }

  // ==================== CUSTOMER HANDLERS ====================

  checkForExistingCustomer(task: EmailTaskExtended): void {
    const request = { email: task.fromEmail, companyNumber: task.companyNumber || undefined };
    this.emailTaskService.checkCustomerExists(request).subscribe({
      next: (response) => {
        this.customerExistsInfo = response;
        if (response.exists) {
          if (confirm(`Customer "${response.customerName}" already exists. Link this task to the existing customer?`)) {
            this.linkExistingCustomer(task.taskId, response.customerId!);
          }
        } else {
          this.openCustomerCreationModal(task);
        }
      },
      error: () => this.openCustomerCreationModal(task)
    });
  }

  openCustomerCreationModal(task: EmailTaskExtended): void {
    this.emailTaskService.getExtractedCustomerData(task.taskId).subscribe({
      next: (data) => {
        this.extractedCustomerData = data;
        this.showCustomerModal = true;
        this.pendingRefreshOnReturn = true;   // refresh grid when user returns
        this.router.navigate(['/customers'], {
          queryParams: { taskId: data.taskId, email: data.email, contactFirstName: data.contactFirstName, mode: 'create' }
        });
      },
      error: (err) => console.error('Error getting extracted data:', err)
    });
  }

  linkExistingCustomer(taskId: number, customerId: number): void {
    this.emailTaskService.linkCustomerToTask(taskId, customerId).subscribe({
      next: () => this.refreshTrigger.next(),
      error: (err) => console.error('Error linking customer:', err)
    });
  }

  onCreateCustomerClick(task: EmailTaskExtended): void { this.checkForExistingCustomer(task); }

  // ==================== HELPERS ====================

  private getStatusFromTab(tab: 'tasks' | 'in-progress' | 'completed' | 'junk'): string {
    const map: Record<string, string> = {
      tasks: 'New',
      'in-progress': 'In Progress',
      completed: 'Completed',
      junk: 'Junk'
    };
    return map[tab] ?? 'New';
  }

  private getStatusesFromTab(tab: string): string[] | undefined {
    if (tab === 'in-progress') return ['In Progress', 'More Info', 'Reopened'];
    if (tab === 'completed')   return ['Completed', 'Closed'];
    return undefined;
  }

  private calculatePageNumbers(currentPage: number, totalPages: number): number[] {
    const pages: number[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 2);
      const end   = Math.min(totalPages - 1, currentPage + 2);
      if (start > 2) pages.push(-1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push(-1);
      pages.push(totalPages);
    }
    return pages;
  }

  formatDate(date: Date | string): string {
    if (!date) return '';
    return new Date(date).toLocaleString('en-IE', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  getCategoryDisplay(category: string): string {
    const map: Record<string, string> = {
      initial_enquiry:    'Initial Enquiry',
      site_visit_meeting: 'Site Visit',
      invoice_due:        'Invoice Due',
      quote_creation:     'Quote Request',
      showroom_booking:   'Showroom',
      complaint:          'Complaint',
      general_inquiry:    'General',
      junk:               'Junk'
    };
    return map[category] || category;
  }

  onKeyDown(event: KeyboardEvent, task: EmailTaskExtended): void {
    if (event.key === 'Enter') this.onRowDoubleClick(task);
  }

  onContextMenu(event: MouseEvent, _task: EmailTaskExtended): void { event.preventDefault(); }

  // ==================== GETTERS/SETTERS ====================

  get activeTab(): 'tasks' | 'in-progress' | 'completed' | 'junk' { return this.activeTabSubject.value; }

  get searchTerm(): string { return this.searchTermSubject.value; }
  set searchTerm(v: string) { this.searchTermSubject.next(v); }

  get filterPriority(): string { return this.filterPrioritySubject.value; }
  set filterPriority(v: string) { this.filterPrioritySubject.next(v); }

  get filterAssignedUser(): number | null { return this.filterAssignedUserSubject.value; }
  set filterAssignedUser(v: number | null) { this.filterAssignedUserSubject.next(v); }

  get currentPage(): number { return this.currentPageSubject.value; }
  set currentPage(v: number) { this.currentPageSubject.next(v); }

  get pageSize(): number { return this.pageSizeSubject.value; }
  set pageSize(v: number) { this.pageSizeSubject.next(v); }

  get sortBy(): string { return this.sortBySubject.value; }
  get sortDirection(): 'ASC' | 'DESC' { return this.sortDirectionSubject.value; }

  // ── Post-workflow-creation: link the new workflow back to the task ──────────

  /**
   * Called when the user returns from /workflow after creating a new workflow.
   * Fetches the customer's workflows, finds the newest one, then calls
   * the backend link-workflow endpoint so EmailTask.WorkflowId is set.
   *
   * This is a best-effort call — errors are only logged, never surfaced.
   */
  private _tryLinkNewestWorkflowToTask(pending: {
    taskId: number;
    category: string;
    incomingEmailId: number;
  }): void {
    // Get the task to find the customerId
    this.emailTaskService.getTaskById(pending.taskId).pipe(
      take(1),
      catchError(err => { console.warn('[EmailTask] getTaskById failed:', err); return of(null); })
    ).subscribe(task => {
      if (!task?.customerId) return;

      // Load all workflows for this customer and pick the newest one
      this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(
        take(1),
        catchError(err => { console.warn('[EmailTask] getWorkflowsForCustomer failed:', err); return of([]); })
      ).subscribe((workflows: WorkflowDto[]) => {
        if (!workflows?.length) return;

        // Sort by workflowId desc (highest = most recently created)
        const newest = workflows.reduce((a, b) => a.workflowId > b.workflowId ? a : b);

        // Link the workflow to the task via the existing endpoint
        this.emailTaskService.linkWorkflowToTask(pending.taskId, newest.workflowId).pipe(
          take(1),
          catchError(err => { console.warn('[EmailTask] linkWorkflowToTask failed:', err); return of(null); })
        ).subscribe(() => {
          // Refresh to show the updated WorkflowId on the task
          this.refreshTrigger.next();
          this.cdr.markForCheck();
        });
      });
    });
  }
}