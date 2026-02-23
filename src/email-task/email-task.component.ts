import { Component, OnInit, ChangeDetectionStrategy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {  EmailTask, User, PaginatedResponse, PageInfo, CustomerExistsResponse, ExtractedCustomerData, EmailTaskService } from '../service/email-task.service';
import { WorkflowService, WorkflowDto } from '../service/workflow.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, switchMap, catchError, shareReplay, tap, take } from 'rxjs/operators';
import { Router } from '@angular/router';

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
export class EmailTaskComponent implements OnInit {
  private isBrowser: boolean;

  // ==================== REACTIVE STATE ====================
  private activeTabSubject       = new BehaviorSubject<'tasks' | 'processed' | 'junk'>('tasks');
  private currentPageSubject     = new BehaviorSubject<number>(1);
  private pageSizeSubject        = new BehaviorSubject<number>(20);
  private searchTermSubject      = new BehaviorSubject<string>('');
  private sortBySubject          = new BehaviorSubject<string>('DateAdded');
  private sortDirectionSubject   = new BehaviorSubject<'ASC' | 'DESC'>('DESC');
  private filterPrioritySubject  = new BehaviorSubject<string>('');
  private filterAssignedUserSubject = new BehaviorSubject<number | null>(null);
  private refreshTrigger         = new BehaviorSubject<void>(undefined);

  activeTab$          = this.activeTabSubject.asObservable();
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
      status: this.getStatusFromTab(activeTab), page, pageSize, sortBy, sortDirection,
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
  activeEmailTab:   'email' | 'attachments' = 'email';
  selectedAssignee: number | null = null;
  selectedAction:   string = '';

  // Workflow guard UI
  workflowCheckInProgress:  boolean       = false;
  showNoWorkflowBanner:     boolean       = false;
  workflowMissingForAction: string        = '';

  // Populated eagerly when the viewer opens — null = not yet checked
  workflowExists:     boolean | null = null;
  existingWorkflowId: number  | null = null;

  // ── Toast notification ─────────────────────────────────────────────────────
  toast: { visible: boolean; type: 'success' | 'error' | 'warning'; message: string } = {
    visible: false, type: 'success', message: ''
  };
  private toastTimer: any = null;

  showToast(type: 'success' | 'error' | 'warning', message: string, durationMs = 4000): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { visible: true, type, message };
    this.toastTimer = setTimeout(() => { this.toast = { ...this.toast, visible: false }; }, durationMs);
  }

  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { ...this.toast, visible: false };
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
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.initializeDataStreams();
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
  }

  // ==================== PAGINATION ====================

  setActiveTab(tab: 'tasks' | 'processed' | 'junk'): void {
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
    this.showNoWorkflowBanner    = false;
    this.workflowMissingForAction = '';
    this.workflowExists          = null;       // reset — will be checked below
    this.existingWorkflowId      = null;

    // Eagerly check workflow existence so buttons reflect real state immediately
    this.loadWorkflowStatus(task);
  }

  /**
   * Checks whether this customer has any workflow and caches the result.
   * Called automatically when the viewer opens — no spinner needed (silent check).
   */
  private loadWorkflowStatus(task: EmailTaskExtended): void {
    if (!task.customerId) {
      this.workflowExists    = false;
      this.existingWorkflowId = null;
      return;
    }

    this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(
      take(1),
      catchError(() => of([] as WorkflowDto[]))
    ).subscribe(workflows => {
      if (!workflows || workflows.length === 0) {
        this.workflowExists     = false;
        this.existingWorkflowId = null;
        return;
      }
      const matched = task.workflowId
        ? workflows.find(w => w.workflowId === task.workflowId) ?? workflows[0]
        : workflows[0];
      this.workflowExists     = true;
      this.existingWorkflowId = matched.workflowId;
    });
  }

  closeEmailViewer(): void {
    this.showEmailViewer          = false;
    this.selectedTask             = null;
    this.selectedAction           = '';
    this.selectedAssignee         = null;
    this.showNoWorkflowBanner     = false;
    this.workflowMissingForAction = '';
    this.workflowExists           = null;
    this.existingWorkflowId       = null;
  }

  setEmailTab(tab: 'email' | 'attachments'): void { this.activeEmailTab = tab; }

  save(): void {
    if (!this.selectedTask) return;

    const task         = this.selectedTask;
    const isAssigning  = this.selectedAssignee !== null && this.selectedAssignee !== task.assignedToUserId;
    const isUnassigning= this.selectedAssignee === null && task.assignedToUserId !== null;
    const isSameUser   = this.selectedAssignee !== null && this.selectedAssignee === task.assignedToUserId;

    // Block if user tries to assign to the same person already assigned
    if (isSameUser && !this.selectedAction) {
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
          // Close viewer, show success toast, then switch to the Processed tab.
          this.closeEmailViewer();
          this.refreshTrigger.next();
          this.showToast('success', `Task assigned successfully and moved to Processed.`);
          // Small delay so the toast is visible before the tab switches
          setTimeout(() => this.setActiveTab('processed'), 600);
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
    this.closeEmailViewer();
    this.router.navigate(['/workflow'], {
      queryParams: {
        customerId:   task.customerId   ?? null,
        customerName: task.customerName ?? '',
        taskId:       task.taskId,
        mode:         'create'
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

  private getStatusFromTab(tab: 'tasks' | 'processed' | 'junk'): string {
    const map: Record<string, string> = { tasks: 'Pending', processed: 'Processed', junk: 'Junk' };
    return map[tab] ?? 'Pending';
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

  get activeTab(): 'tasks' | 'processed' | 'junk' { return this.activeTabSubject.value; }

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
}