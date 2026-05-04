import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AppTaskSummaryDto, User, PaginatedResponse, PageInfo, CustomerExistsResponse, ExtractedCustomerData, EmailTaskService } from '../service/email-task.service';
import { WorkflowService, WorkflowDto } from '../service/workflow.service';
import { CustomerService } from '../service/customer-service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, combineLatest, of, Subject, forkJoin } from 'rxjs';
import { map, switchMap, catchError, shareReplay, take, filter, takeUntil } from 'rxjs/operators';
import { Router, NavigationEnd } from '@angular/router';

export interface EmailAttachment {
  attachmentId:   number;
  fileName:       string;
  fileSize:       number;
  fileType:       string;
  blobUrl:        string;
  isInline:       boolean;
  contentId?:     string | null;
  extractedText?: string | null;
  dateUploaded?:  string | null;
  uploadedBy?:    string | null;
}

export interface EmailTaskExtended extends Omit<AppTaskSummaryDto, 'sourceType'> {
  sourceType?:      string | null;
  quoteId?:         number | null;
  workflowName?:    string | null;
  // Heavy fields — populated after detail fetch, undefined on list items
  emailBody?:       string | null;
  bodyBlobUrl?:     string | null;
  attachments?:     EmailAttachment[];
  comments?:        any[];
  history?:         any[];
  aiReasoning?:     string | null;
  processedBy?:     string | null;
  completedBy?:     string | null;
  completionNotes?: string | null;
  createdBy?:       string | null;
  updatedBy?:       string | null;
  assignedTo?:      string | null;
}

type WorkflowGuardResult =
  | { ok: true;  workflowId: number }
  | { ok: false; reason: 'no_customer' | 'no_workflow' | 'loading_error' };

// ── Two-level tab types ───────────────────────────────────────────────────────
/** Top-level section selector */
type TopTab = 'email' | 'site-visit';
/** Sub-tabs shown only when topTab === 'email' */
type EmailSubTab = 'tasks' | 'in-progress' | 'completed' | 'junk';

@Component({
  selector: 'app-task',
  templateUrl: './email-task.component.html',
  standalone: true,
  imports: [FormsModule, CommonModule],
  styleUrls: ['./email-task.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskComponent implements OnInit, OnDestroy {
  private isBrowser: boolean;
  private destroy$ = new Subject<void>();

  private pendingRefreshOnReturn = false;
  private _pendingWorkflowLinkTask: {
    taskId: number; category: string; incomingEmailId: number;
  } | null = null;

  // ── Top tab ──────────────────────────────────────────────────────────────
  private topTabSubject = new BehaviorSubject<TopTab>('email');
  topTab$               = this.topTabSubject.asObservable();
  get topTab(): TopTab  { return this.topTabSubject.value; }

  // ── Email sub-tab ────────────────────────────────────────────────────────
  private activeTabSubject = new BehaviorSubject<EmailSubTab>('tasks');
  activeTab$               = this.activeTabSubject.asObservable();
  get activeTab(): EmailSubTab { return this.activeTabSubject.value; }

  // ── Pagination / filter subjects ─────────────────────────────────────────
  private currentPageSubject        = new BehaviorSubject<number>(1);
  private pageSizeSubject           = new BehaviorSubject<number>(20);
  private searchTermSubject         = new BehaviorSubject<string>('');
  private sortBySubject             = new BehaviorSubject<string>('DateAdded');
  private sortDirectionSubject      = new BehaviorSubject<'ASC' | 'DESC'>('DESC');
  private filterPrioritySubject     = new BehaviorSubject<string>('');
  private filterAssignedUserSubject = new BehaviorSubject<number | null>(null);
  private refreshTrigger            = new BehaviorSubject<void>(undefined);

  currentPage$        = this.currentPageSubject.asObservable();
  pageSize$           = this.pageSizeSubject.asObservable();
  searchTerm$         = this.searchTermSubject.asObservable();
  filterPriority$     = this.filterPrioritySubject.asObservable();
  filterAssignedUser$ = this.filterAssignedUserSubject.asObservable();

  // ── Master filters$ ───────────────────────────────────────────────────────
  // When topTab = 'email'      → sourceTypes=['Email'],     status driven by sub-tab
  // When topTab = 'site-visit' → sourceTypes=['SiteVisit'], no status scoping
  private filters$ = combineLatest([
    this.topTabSubject, this.activeTabSubject,
    this.currentPageSubject, this.pageSizeSubject,
    this.searchTermSubject, this.sortBySubject, this.sortDirectionSubject,
    this.filterPrioritySubject, this.filterAssignedUserSubject, this.refreshTrigger
  ]).pipe(
    map(([topTab, activeTab, page, pageSize, searchTerm, sortBy, sortDirection, priority, assignedUser]) => {
      const base = {
        page, pageSize, sortBy, sortDirection,
        searchTerm:       searchTerm   || undefined,
        priority:         priority     || undefined,
        assignedToUserId: assignedUser || undefined,
      };
      if (topTab === 'site-visit') {
        return { ...base, sourceTypes: ['SiteVisit'], status: undefined, statuses: undefined };
      }
      return {
        ...base,
        sourceTypes: ['Email'],
        status:      this.getStatusFromSubTab(activeTab),
        statuses:    this.getStatusesFromSubTab(activeTab),
      };
    })
  );

  private tasksResponse$!: Observable<PaginatedResponse<AppTaskSummaryDto>>;
  tasks$!:       Observable<EmailTaskExtended[]>;
  pageInfo$!:    Observable<PageInfo>;
  totalItems$!:  Observable<number>;
  totalPages$!:  Observable<number>;
  pageNumbers$!: Observable<number[]>;

  isLoading$    = new BehaviorSubject<boolean>(false);
  users$!:       Observable<User[]>;
  currentUser$!: Observable<User | null>;

  // ── Email viewer state ───────────────────────────────────────────────────
  selectedTask:       EmailTaskExtended | null = null;
  showEmailViewer:    boolean = false;
  activeEmailTab:     'email' | 'attachments' | 'send-email' = 'email';
  selectedAssignee:   number | null = null;
  selectedAction:     string = '';
  selectedStatus:     string = '';
  emailBodyHtml:      string = '';
  isLoadingEmailBody: boolean = false;
  isLoadingTask:      boolean = false;

  readonly statusOptions = [
    { value: 'New',         label: 'New'         },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'More Info',   label: 'More Info'   },
    { value: 'Closed',      label: 'Closed'      },
    { value: 'Reopened',    label: 'Reopened'    },
    { value: 'Completed',   label: 'Completed'   },
  ];

  currentUserId: number | null = null;
  isAdmin: boolean = false;

  // ── Site Visit panel state ───────────────────────────────────────────────
  selectedSiteVisitTask: EmailTaskExtended | null = null;
  showSiteVisitPanel:    boolean = false;
  siteVisitAssignee:     number | null = null;
  siteVisitStatus:       string = 'New';
  readonly siteVisitStatuses = ['New', 'In Progress', 'Completed'];
  isSiteVisitSaving:     boolean = false;

  // ── Send Email state ─────────────────────────────────────────────────────
  sendEmailSubject: string  = '';
  sendEmailBody:    string  = '';
  isSendingEmail:   boolean = false;
  sendEmailSuccess: string  = '';
  sendEmailError:   string  = '';

  // ── Workflow guard UI ────────────────────────────────────────────────────
  workflowCheckInProgress:  boolean = false;
  showNoWorkflowBanner:     boolean = false;
  workflowMissingForAction: string  = '';

  readonly workflowStatus$ = new BehaviorSubject<{
    exists: boolean | null; workflowId: number | null; workflowName: string | null;
  }>({ exists: null, workflowId: null, workflowName: null });

  private get _ws() { return this.workflowStatus$.value; }
  get workflowExists():       boolean | null { return this._ws.exists;     }
  get existingWorkflowId():   number  | null { return this._ws.workflowId; }
  get existingWorkflowName(): string  | null { return this._ws.workflowName; }

  // ── Toast ────────────────────────────────────────────────────────────────
  toast: { visible: boolean; type: 'success' | 'error' | 'warning'; message: string } = {
    visible: false, type: 'success', message: ''
  };
  private toastTimer: any = null;

  showToast(type: 'success' | 'error' | 'warning', message: string, durationMs = 4000): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { visible: true, type, message };
    this.cdr.markForCheck();
    this.toastTimer = setTimeout(() => { this.toast = { ...this.toast, visible: false }; this.cdr.markForCheck(); }, durationMs);
  }
  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { ...this.toast, visible: false };
    this.cdr.markForCheck();
  }

  // ── Category permissions ─────────────────────────────────────────────────
  readonly categoryPermissions: Record<string, { canGenerateQuote: boolean; canGenerateInvoice: boolean; canAddSiteVisit: boolean; canCreateWorkflow: boolean; }> = {
    quote_creation:     { canGenerateQuote: true,  canGenerateInvoice: false, canAddSiteVisit: false, canCreateWorkflow: true  },
    invoice_due:        { canGenerateQuote: true,  canGenerateInvoice: true,  canAddSiteVisit: false, canCreateWorkflow: true  },
    site_visit_meeting: { canGenerateQuote: false, canGenerateInvoice: false, canAddSiteVisit: true,  canCreateWorkflow: true  },
    initial_enquiry:    { canGenerateQuote: true,  canGenerateInvoice: true,  canAddSiteVisit: true,  canCreateWorkflow: true  },
    general_inquiry:    { canGenerateQuote: true,  canGenerateInvoice: true,  canAddSiteVisit: true,  canCreateWorkflow: true  },
    showroom_booking:   { canGenerateQuote: true,  canGenerateInvoice: false, canAddSiteVisit: false, canCreateWorkflow: true  },
    complaint:          { canGenerateQuote: false, canGenerateInvoice: false, canAddSiteVisit: false, canCreateWorkflow: false },
    junk:               { canGenerateQuote: false, canGenerateInvoice: false, canAddSiteVisit: false, canCreateWorkflow: false },
  };

  get categoryPerms() {
    const cat = this.selectedTask?.category ?? '';
    return this.categoryPermissions[cat] ?? { canGenerateQuote: true, canGenerateInvoice: true, canAddSiteVisit: true, canCreateWorkflow: true };
  }
  get showQuoteBtn():     boolean { return this.categoryPerms.canGenerateQuote;   }
  get showInvoiceBtn():   boolean { return this.categoryPerms.canGenerateInvoice; }
  get showSiteVisitBtn(): boolean { return this.categoryPerms.canAddSiteVisit;    }
  get showWorkflowBtn():  boolean { return this.categoryPerms.canCreateWorkflow;  }
  get canQuote():         boolean { return !!this.selectedTask?.customerId && this.workflowExists === true; }
  get canInvoice():       boolean { return !!this.selectedTask?.customerId && this.workflowExists === true; }
  get canSiteVisit():     boolean { return !!this.selectedTask?.customerId && this.workflowExists === true; }
  get canWorkflow():      boolean { return !!this.selectedTask?.customerId && this.workflowExists !== true; }
  get noCustomerTip():    string  { return 'Create a customer for this email first'; }
  get noWorkflowTip():    string  { return 'No workflow yet — click Create Workflow first'; }

  pageSizeOptions: number[] = [10, 20, 50, 100];
  today: Date = new Date();
  Math = Math;
  showCustomerModal:     boolean = false;
  extractedCustomerData: ExtractedCustomerData | null = null;
  customerExistsInfo:    CustomerExistsResponse | null = null;
  availableActions = [
    { value: 'add_company',      label: 'Add Company'      },
    { value: 'generate_quote',   label: 'Generate Quote'   },
    { value: 'generate_invoice', label: 'Generate Invoice' },
    { value: 'add_site_visit',   label: 'Add Site Visit'   },
    { value: 'create_workflow',  label: 'Create Workflow'  },
    { value: 'move_to_junk',     label: 'Move to Junk'     },
  ];

  constructor(
    private emailTaskService: EmailTaskService,
    private workflowService:  WorkflowService,
    private customerService:  CustomerService,
    private router:           Router,
    private cdr:              ChangeDetectorRef,
    private http:             HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) { this.isBrowser = isPlatformBrowser(platformId); }

  ngOnInit(): void {
    this.initializeDataStreams();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe((e: any) => {
        const url: string = e.urlAfterRedirects ?? e.url ?? '';
        if (url.includes('/email-tasks') || url === '/') {
          if (this.pendingRefreshOnReturn) { this.pendingRefreshOnReturn = false; this.refreshTrigger.next(); this.cdr.markForCheck(); }
          if (this._pendingWorkflowLinkTask) { this._tryLinkNewestWorkflowToTask(this._pendingWorkflowLinkTask); this._pendingWorkflowLinkTask = null; }
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private initializeDataStreams(): void {
    this.tasksResponse$ = this.filters$.pipe(
      switchMap(filters => this.emailTaskService.getTasksPaginated(filters).pipe(
        catchError(() => of({ tasks: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 }))
      )),
      shareReplay(1)
    );
    this.tasks$ = combineLatest([this.tasksResponse$, this.topTabSubject]).pipe(
      switchMap(([r, topTab]) => {
        const filtered = (topTab === 'email'
          ? r.tasks.filter(t => (t.sourceType ?? 'Email') !== 'SiteVisit')
          : r.tasks) as EmailTaskExtended[];
        return topTab === 'site-visit' ? this.enrichWithCustomerNames(filtered) : of(filtered);
      })
    );
    this.pageInfo$    = this.tasksResponse$.pipe(map(r => this.emailTaskService.getPageInfo(r)));
    this.totalItems$  = this.tasksResponse$.pipe(map(r => r.totalCount));
    this.totalPages$  = this.tasksResponse$.pipe(map(r => r.totalPages));
    this.pageNumbers$ = combineLatest([this.currentPageSubject, this.totalPages$]).pipe(
      map(([cp, tp]) => this.calculatePageNumbers(cp, tp))
    );
    this.users$       = this.emailTaskService.getUsers().pipe(catchError(() => of([])), shareReplay(1));
    this.currentUser$ = this.emailTaskService.getCurrentUser().pipe(catchError(() => of(null)), shareReplay(1));
    this.currentUser$.pipe(take(1)).subscribe(user => {
      if (user) {
        this.currentUserId = (user as any).userId ?? null;
        this.isAdmin = (user as any).role === 'Admin';
        // Non-admin users only see tasks assigned to themselves
        if (!this.isAdmin && this.currentUserId) {
          this.filterAssignedUserSubject.next(this.currentUserId);
        }
        this.cdr.markForCheck();
      }
    });
  }

  // ── Tab navigation ───────────────────────────────────────────────────────

  /** Switch the TOP tab (Email ↔ Site Visits). Resets page + closes all panels. */
  setTopTab(tab: TopTab): void {
    if (this.topTabSubject.value === tab) return;
    this.topTabSubject.next(tab);
    this.currentPageSubject.next(1);
    this._closeAllPanels();
  }

  /** Switch the EMAIL sub-tab. Only relevant when topTab === 'email'. */
  setActiveTab(tab: EmailSubTab): void {
    this.activeTabSubject.next(tab);
    this.currentPageSubject.next(1);
    this._closeAllPanels();
  }

  private _closeAllPanels(): void {
    this.closeSiteVisitPanel();
    this.showEmailViewer = false;
    this.selectedTask    = null;
  }

  // ── Pagination helpers ───────────────────────────────────────────────────
  goToPage(page: number): void { this.currentPageSubject.next(page); }
  nextPage(): void { this.totalPages$.pipe(take(1)).subscribe(tp => { if (this.currentPageSubject.value < tp) this.currentPageSubject.next(this.currentPageSubject.value + 1); }); }
  previousPage(): void { if (this.currentPageSubject.value > 1) this.currentPageSubject.next(this.currentPageSubject.value - 1); }
  firstPage(): void { this.currentPageSubject.next(1); }
  lastPage(): void { this.totalPages$.pipe(take(1)).subscribe(tp => this.currentPageSubject.next(tp)); }
  changePageSize(newSize: number): void { this.pageSizeSubject.next(newSize); this.currentPageSubject.next(1); }
  applySearch():  void { this.currentPageSubject.next(1); this.refreshTrigger.next(); }
  clearSearch():  void { this.searchTermSubject.next(''); this.currentPageSubject.next(1); }
  applyFilters(): void { this.currentPageSubject.next(1); this.refreshTrigger.next(); }
  clearFilters(): void { this.filterPrioritySubject.next(''); this.filterAssignedUserSubject.next(null); this.currentPageSubject.next(1); }
  sortByColumn(column: string): void {
    if (this.sortBySubject.value === column) this.sortDirectionSubject.next(this.sortDirectionSubject.value === 'ASC' ? 'DESC' : 'ASC');
    else { this.sortBySubject.next(column); this.sortDirectionSubject.next('DESC'); }
  }
  getSortIndicator(column: string): string {
    if (this.sortBySubject.value !== column) return '';
    return this.sortDirectionSubject.value === 'ASC' ? '↑' : '↓';
  }
  updateSearchTerm(term: string): void              { this.searchTermSubject.next(term); }
  updateFilterPriority(p: string): void             { this.filterPrioritySubject.next(p); }
  updateFilterAssignedUser(id: number | null): void { this.filterAssignedUserSubject.next(id); }

  // ── Row double-click routing ─────────────────────────────────────────────
  onRowDoubleClick(task: EmailTaskExtended): void {
    if (this.topTabSubject.value === 'site-visit') { this.openSiteVisitPanel(task); return; }
    this._openEmailViewer(task);
  }

  // ── Email viewer ─────────────────────────────────────────────────────────
  private _openEmailViewer(task: EmailTaskExtended): void {
    // Open immediately with summary data so header/meta is visible right away
    this.selectedTask             = task;
    this.showEmailViewer          = true;
    this.activeEmailTab           = 'email';
    this.isLoadingTask            = true;
    this.emailBodyHtml            = '';
    this.selectedAssignee         = task.assignedToUserId ?? null;
    this.selectedStatus           = task.status ?? 'New';
    this.showNoWorkflowBanner     = false;
    this.workflowMissingForAction = '';
    if (task.workflowId) this.workflowStatus$.next({ exists: true, workflowId: task.workflowId, workflowName: null });
    else                 this.workflowStatus$.next({ exists: null, workflowId: null, workflowName: null });
    this.loadWorkflowStatus(task);
    this.cdr.markForCheck();

    // Phase 2: fetch full task (body, attachments, history)
    this.emailTaskService.getTaskById(task.taskId).pipe(
      take(1),
      catchError(() => of(null))
    ).subscribe(fullTask => {
      this.isLoadingTask = false;
      if (fullTask) {
        this.selectedTask = { ...task, ...fullTask } as EmailTaskExtended;
        this._loadEmailBody(this.selectedTask);
      }
      this.cdr.markForCheck();
    });
  }

  private _loadEmailBody(task: EmailTaskExtended): void {
    if (task.bodyBlobUrl) {
      this.isLoadingEmailBody = true;
      this.emailBodyHtml      = '';
      this.cdr.markForCheck();
      this.http.get(task.bodyBlobUrl, { responseType: 'text' })
        .pipe(takeUntil(this.destroy$), catchError(() => of(task.emailBody ?? '')))
        .subscribe(html => {
          this.emailBodyHtml      = html;
          this.isLoadingEmailBody = false;
          this.cdr.markForCheck();
        });
    } else {
      this.emailBodyHtml      = task.emailBody ?? '';
      this.isLoadingEmailBody = false;
    }
  }

  get downloadableAttachments(): EmailAttachment[] {
    return (this.selectedTask?.attachments as EmailAttachment[] | undefined)
      ?.filter(a => !a.isInline) ?? [];
  }

  private enrichWithCustomerNames(tasks: EmailTaskExtended[]): Observable<EmailTaskExtended[]> {
    const customerIds = [...new Set(tasks.filter(t => t.customerId).map(t => t.customerId as number))];
    if (customerIds.length === 0) return of(tasks);

    const customerFetches$ = customerIds.map(id =>
      this.customerService.getCustomerById(id).pipe(
        map(c => ({ id, name: c.name })),
        catchError(() => of({ id, name: null as string | null }))
      )
    );
    const workflowFetches$ = customerIds.map(id =>
      this.workflowService.getWorkflowsForCustomer(id).pipe(
        map(wfs => ({ customerId: id, workflows: wfs })),
        catchError(() => of({ customerId: id, workflows: [] as WorkflowDto[] }))
      )
    );

    return forkJoin([forkJoin(customerFetches$), forkJoin(workflowFetches$)]).pipe(
      map(([customerResults, workflowResults]) => {
        const customerMap = new Map(customerResults.map(r => [r.id, r.name]));
        const workflowMap = new Map<number, string>();
        workflowResults.forEach(r => r.workflows.forEach(w => workflowMap.set(w.workflowId, w.workflowName)));
        return tasks.map(t => {
          const enriched = { ...t };
          if (t.customerId && !t.customerName) enriched.customerName = customerMap.get(t.customerId) ?? t.customerName;
          if (t.workflowId && !t.workflowName) enriched.workflowName = workflowMap.get(t.workflowId) ?? null;
          return enriched;
        });
      })
    );
  }

  private loadWorkflowStatus(task: EmailTaskExtended): void {
    if (!task.customerId) { this.workflowStatus$.next({ exists: false, workflowId: null, workflowName: null }); return; }
    this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(take(1), catchError(() => of([] as WorkflowDto[])))
      .subscribe(workflows => {
        if (!workflows?.length) { this.workflowStatus$.next({ exists: false, workflowId: null, workflowName: null }); return; }
        const matched = task.workflowId ? workflows.find(w => w.workflowId === task.workflowId) ?? workflows[0] : workflows[0];
        this.workflowStatus$.next({ exists: true, workflowId: matched.workflowId, workflowName: matched.workflowName || matched.productName || `Workflow #${matched.workflowId}` });
      });
  }

  closeEmailViewer(): void {
    this.showEmailViewer = false; this.selectedTask = null; this.selectedAction = '';
    this.selectedAssignee = null; this.selectedStatus = '';
    this.showNoWorkflowBanner = false; this.workflowMissingForAction = '';
    this.workflowStatus$.next({ exists: null, workflowId: null, workflowName: null });
    this.clearSendEmail();
  }

  setEmailTab(tab: 'email' | 'attachments' | 'send-email'): void {
    this.activeEmailTab = tab;
    if (tab === 'send-email' && !this.sendEmailSubject && this.selectedTask)
      this.sendEmailSubject = `Re: ${this.selectedTask.subject ?? ''}`;
  }

  sendEmail(): void {
    if (!this.selectedTask) return;
    if (!this.sendEmailBody.trim()) { this.sendEmailError = 'Please enter a message body.'; this.cdr.markForCheck(); return; }
    this.isSendingEmail = true; this.sendEmailError = ''; this.sendEmailSuccess = ''; this.cdr.markForCheck();
    this.emailTaskService.sendTaskEmail(this.selectedTask.taskId, {
      toEmail: this.selectedTask.fromEmail ?? undefined, toName: this.selectedTask.fromName ?? undefined,
      subject: this.sendEmailSubject, body: this.sendEmailBody,
      originalEmailGraphId: (this.selectedTask as any).emailGraphId ?? null
    }).subscribe({
      next:  () => { this.isSendingEmail = false; this.closeEmailViewer(); this.refreshTrigger.next(); this.showToast('success', 'Email sent successfully!'); },
      error: (err) => { this.isSendingEmail = false; this.sendEmailError = err?.error?.error ?? 'Failed to send email.'; this.showToast('error', this.sendEmailError); }
    });
  }
  clearSendEmail(): void { this.sendEmailSubject = ''; this.sendEmailBody = ''; this.sendEmailError = ''; this.sendEmailSuccess = ''; }

  // ── Site Visit panel ─────────────────────────────────────────────────────
  openSiteVisitPanel(task: EmailTaskExtended): void {
    this.selectedSiteVisitTask = task;
    this.siteVisitAssignee = task.assignedToUserId ?? null;
    this.siteVisitStatus   = task.status || 'New';
    this.showSiteVisitPanel = true; this.cdr.markForCheck();
  }
  closeSiteVisitPanel(): void {
    this.showSiteVisitPanel = false; this.selectedSiteVisitTask = null;
    this.siteVisitAssignee = null;   this.siteVisitStatus = 'New';
    this.isSiteVisitSaving = false;
    this.cdr.markForCheck();
  }

  openSiteVisitPage(task: EmailTaskExtended | null): void {
    if (!task) return;
    const queryParams: Record<string, any> = {
      customerId:   task.customerId   ?? null,
      customerName: task.customerName ?? '',
      workflowId:   task.workflowId   ?? null,
    };
    if (task.siteVisitId) {
      queryParams['siteVisitId'] = task.siteVisitId;
    }
    this.closeSiteVisitPanel();
    this.router.navigate(['/workflow/setup-site-visit'], { queryParams });
  }
  saveSiteVisitAssignment(): void {
    const task = this.selectedSiteVisitTask;
    if (!task) return;
    const statusChanged  = this.siteVisitStatus !== (task.status || 'New');
    const isAssigning    = this.siteVisitAssignee !== null && this.siteVisitAssignee !== task.assignedToUserId;
    const isUnassigning  = this.siteVisitAssignee === null && task.assignedToUserId !== null;
    if (!statusChanged && !isAssigning && !isUnassigning) { this.closeSiteVisitPanel(); return; }
    this.isSiteVisitSaving = true; this.cdr.markForCheck();
    const ops$: Observable<any>[] = [];
    if (statusChanged) ops$.push(this.emailTaskService.updateTaskStatus(task.taskId, this.siteVisitStatus));
    if (isAssigning)   ops$.push(this.emailTaskService.assignTask(task.taskId, this.siteVisitAssignee!));
    if (isUnassigning) ops$.push(this.emailTaskService.unassignTask(task.taskId));
    forkJoin(ops$).subscribe({
      next:  () => { this.isSiteVisitSaving = false; this.closeSiteVisitPanel(); this.refreshTrigger.next(); this.showToast('success', 'Site visit updated ✅'); },
      error: (err) => { this.isSiteVisitSaving = false; this.cdr.markForCheck(); this.showToast('error', `Failed: ${err?.message ?? 'Unknown error'}`); }
    });
  }

  // ── Save (email viewer) ──────────────────────────────────────────────────
  save(): void {
    if (!this.selectedTask) return;
    const task = this.selectedTask;
    const isAssigning    = this.selectedAssignee !== null && this.selectedAssignee !== task.assignedToUserId;
    const isUnassigning  = this.selectedAssignee === null && task.assignedToUserId !== null;
    const isSameUser     = this.selectedAssignee !== null && this.selectedAssignee === task.assignedToUserId;
    const isStatusChange = this.selectedStatus && this.selectedStatus !== task.status;
    if (isSameUser && !this.selectedAction && !isStatusChange) { this.showToast('warning', `Task is already assigned to ${task.assignedToUserName ?? task.assignedTo ?? 'this user'}.`); return; }
    const promises: Promise<any>[] = [];
    if (isAssigning)                    promises.push(this.emailTaskService.assignTask(task.taskId, this.selectedAssignee!).toPromise());
    else if (isUnassigning)             promises.push(this.emailTaskService.unassignTask(task.taskId).toPromise());
    if (isStatusChange && !isAssigning) promises.push(this.emailTaskService.updateTaskStatus(task.taskId, this.selectedStatus).toPromise());
    const navActions = new Set(['generate_quote', 'generate_invoice', 'add_site_visit', 'create_workflow']);
    if (this.selectedAction && !navActions.has(this.selectedAction)) promises.push(this.emailTaskService.executeAction(task.taskId, this.selectedAction).toPromise());
    if (!promises.length) { this.closeEmailViewer(); return; }
    Promise.all(promises).then(() => {
      if (isAssigning) {
        this.closeEmailViewer(); this.refreshTrigger.next();
        this.showToast('success', 'Task assigned and moved to In Progress.');
        setTimeout(() => { this.setActiveTab('in-progress'); this.cdr.markForCheck(); }, 600);
      } else if (isStatusChange && (this.selectedStatus === 'Completed' || this.selectedStatus === 'Closed')) {
        this.closeEmailViewer(); this.refreshTrigger.next(); this.cdr.markForCheck();
        this.showToast('success', `Task marked as ${this.selectedStatus} ✅`);
        setTimeout(() => { this.setActiveTab('completed'); this.cdr.markForCheck(); }, 600);
      } else { this.closeEmailViewer(); this.refreshTrigger.next(); }
    }).catch(err => this.showToast('error', `Failed: ${err?.message ?? 'Unknown error'}`));
  }

  completeTask(): void {
    if (!this.selectedTask) return;
    this.emailTaskService.updateTaskStatus(this.selectedTask.taskId, 'Completed').subscribe({
      next:  () => { this.closeEmailViewer(); this.refreshTrigger.next(); this.cdr.markForCheck(); this.showToast('success', 'Task marked as Completed ✅'); setTimeout(() => { this.setActiveTab('completed'); this.cdr.markForCheck(); }, 600); },
      error: (err) => this.showToast('error', `Failed: ${err?.message ?? 'Unknown error'}`)
    });
  }

  get canCompleteTask(): boolean {
    if (!this.selectedTask) return false;
    const st = (this.selectedTask.status ?? '').toLowerCase();
    if (st === 'completed' || st === 'closed') return false;
    if (this.selectedStatus === 'Completed' || this.selectedStatus === 'Closed') return false;
    if (!this.selectedTask.assignedToUserId) return false;
    return this.isAdmin || this.selectedTask.assignedToUserId === this.currentUserId;
  }

  downloadAttachment(attachment: EmailAttachment): void {
    if (!this.isBrowser || !this.selectedTask) return;
    const taskId = this.selectedTask.taskId;
    this.emailTaskService.downloadAttachment(taskId, attachment.attachmentId)
      .pipe(take(1), catchError(() => { this.showToast('error', 'Failed to download attachment.'); return of(null); }))
      .subscribe(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = attachment.fileName;
        a.click();
        URL.revokeObjectURL(url);
      });
  }
  createNewTask(): void { console.log('Create new task'); }

  // ── Workflow guard ────────────────────────────────────────────────────────
  private checkWorkflowExists(task: EmailTaskExtended): Observable<WorkflowGuardResult> {
    if (!task.customerId) return of({ ok: false, reason: 'no_customer' } as WorkflowGuardResult);
    return this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(
      map((wfs: WorkflowDto[]) => {
        if (!wfs?.length) return { ok: false, reason: 'no_workflow' } as WorkflowGuardResult;
        const matched = task.workflowId ? wfs.find(w => w.workflowId === task.workflowId) : null;
        return { ok: true, workflowId: (matched ?? wfs[0]).workflowId } as WorkflowGuardResult;
      }),
      catchError(() => of({ ok: false, reason: 'loading_error' } as WorkflowGuardResult))
    );
  }

  // ── Action handlers ───────────────────────────────────────────────────────
  onCreateWorkflowClick(task: EmailTaskExtended): void {
    this.pendingRefreshOnReturn = true;
    this._pendingWorkflowLinkTask = { taskId: task.taskId, category: task.taskType ?? task.category ?? '', incomingEmailId: task.incomingEmailId ?? 0 };
    this.closeEmailViewer();
    this.router.navigate(['/workflow'], { queryParams: { customerId: task.customerId ?? null, customerName: task.customerName ?? '', customerEmail: task.fromEmail ?? '', taskId: task.taskId, mode: 'create' } });
  }
  onInitialEnquiryClick(task: EmailTaskExtended): void {
    if (!task.customerId)         { alert('Please create a customer first.'); return; }
    if (!this.existingWorkflowId) { this.workflowMissingForAction = 'initial_enquiry'; this.showNoWorkflowBanner = true; return; }
    this.closeEmailViewer();
    this.router.navigate(['/workflow/initial-enquiry'], { queryParams: { workflowId: this.existingWorkflowId, customerId: task.customerId, customerName: task.customerName ?? '', customerEmail: task.fromEmail ?? '', taskId: task.taskId, fromTask: task.taskId } });
  }
  navigateToExistingWorkflow(task: EmailTaskExtended): void {
    if (!task.customerId || !this.existingWorkflowId) return;
    this.closeEmailViewer();
    this.router.navigate(['/workflow'], { queryParams: { customerId: task.customerId, customerName: task.customerName ?? '', workflowId: this.existingWorkflowId } });
  }
  onGenerateQuoteClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }
    if (this.workflowExists === null) { this.workflowCheckInProgress = true; this.checkWorkflowExists(task).subscribe(r => { this.workflowCheckInProgress = false; r.ok ? (this.workflowStatus$.next({ exists: true, workflowId: r.workflowId, workflowName: this._ws.workflowName }), this._navToQuote(task, r.workflowId)) : (this.workflowMissingForAction = 'generate_quote', this.showNoWorkflowBanner = true); }); return; }
    if (!this.workflowExists || !this.existingWorkflowId) { this.workflowMissingForAction = 'generate_quote'; this.showNoWorkflowBanner = true; return; }
    this._navToQuote(task, this.existingWorkflowId);
  }
  private _navToQuote(task: EmailTaskExtended, workflowId: number): void { this.closeEmailViewer(); this.router.navigate(['/workflow/create-quote'], { queryParams: { taskId: task.taskId, customerId: task.customerId, customerName: task.customerName ?? '', workflowId } }); }
  onGenerateInvoiceClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }
    if (this.workflowExists === null) { this.workflowCheckInProgress = true; this.checkWorkflowExists(task).subscribe(r => { this.workflowCheckInProgress = false; r.ok ? (this.workflowStatus$.next({ exists: true, workflowId: r.workflowId, workflowName: this._ws.workflowName }), this._navToInvoice(task, r.workflowId)) : (this.workflowMissingForAction = 'generate_invoice', this.showNoWorkflowBanner = true); }); return; }
    if (!this.workflowExists || !this.existingWorkflowId) { this.workflowMissingForAction = 'generate_invoice'; this.showNoWorkflowBanner = true; return; }
    this._navToInvoice(task, this.existingWorkflowId);
  }
  private _navToInvoice(task: EmailTaskExtended, workflowId: number): void {
    if (task.quoteId) { this.closeEmailViewer(); this.router.navigate(['/workflow/invoice'], { queryParams: { taskId: task.taskId, customerId: task.customerId, customerName: task.customerName ?? '', workflowId, quoteId: task.quoteId } }); }
    else if (confirm('No quote yet.\n\nClick OK to go to Generate Quote first.')) this._navToQuote(task, workflowId);
  }
  onAddSiteVisitClick(task: EmailTaskExtended): void {
    if (!task.customerId) { alert('Please create a customer first.'); return; }
    if (this.workflowExists === null) { this.workflowCheckInProgress = true; this.checkWorkflowExists(task).subscribe(r => { this.workflowCheckInProgress = false; r.ok ? (this.workflowStatus$.next({ exists: true, workflowId: r.workflowId, workflowName: this._ws.workflowName }), this._navToSiteVisit(task, r.workflowId)) : (this.workflowMissingForAction = 'add_site_visit', this.showNoWorkflowBanner = true); }); return; }
    if (!this.workflowExists || !this.existingWorkflowId) { this.workflowMissingForAction = 'add_site_visit'; this.showNoWorkflowBanner = true; return; }
    this._navToSiteVisit(task, this.existingWorkflowId);
  }
  private _navToSiteVisit(task: EmailTaskExtended, workflowId: number): void {
    this.closeEmailViewer();
    this.router.navigate(['/workflow/setup-site-visit'], { queryParams: { taskId: task.taskId, customerId: task.customerId, customerName: task.customerName ?? '', workflowId, emailSubject: task.subject ?? '', emailBody: task.emailBody ?? '', fromName: task.fromName ?? '', fromEmail: task.fromEmail ?? '', mode: 'from-email' } });
  }
  onCreateWorkflowFromBanner(): void { if (this.selectedTask) this.onCreateWorkflowClick(this.selectedTask); }
  dismissNoWorkflowBanner():    void { this.showNoWorkflowBanner = false; this.workflowMissingForAction = ''; }

  // ── Customer handlers ─────────────────────────────────────────────────────
  checkForExistingCustomer(task: EmailTaskExtended): void {
    this.emailTaskService.checkCustomerExists({ email: task.fromEmail ?? undefined, companyNumber: task.companyNumber ?? undefined }).subscribe({
      next: (res) => { this.customerExistsInfo = res; if (res.exists) { if (confirm(`Customer "${res.customerName}" already exists. Link?`)) this.linkExistingCustomer(task.taskId, res.customerId!); } else this.openCustomerCreationModal(task); },
      error: () => this.openCustomerCreationModal(task)
    });
  }
  openCustomerCreationModal(task: EmailTaskExtended): void {
    this.emailTaskService.getExtractedCustomerData(task.taskId).subscribe({
      next:  (d) => { this.extractedCustomerData = d; this.showCustomerModal = true; this.pendingRefreshOnReturn = true; this.router.navigate(['/customers'], { queryParams: { taskId: d.taskId, email: d.email, contactFirstName: d.contactFirstName, mode: 'create' } }); },
      error: (err) => console.error('Error getting extracted data:', err)
    });
  }
  linkExistingCustomer(taskId: number, customerId: number): void {
    this.emailTaskService.linkCustomerToTask(taskId, customerId).subscribe({ next: () => this.refreshTrigger.next(), error: (err) => console.error('Error linking customer:', err) });
  }
  onCreateCustomerClick(task: EmailTaskExtended): void { this.checkForExistingCustomer(task); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private getStatusFromSubTab(tab: EmailSubTab): string | undefined {
    return tab === 'tasks' ? 'New' : tab === 'junk' ? 'Junk' : undefined;
  }
  private getStatusesFromSubTab(tab: EmailSubTab): string[] | undefined {
    if (tab === 'in-progress') return ['In Progress', 'More Info', 'Reopened'];
    if (tab === 'completed')   return ['Completed', 'Closed'];
    return undefined;
  }
  private calculatePageNumbers(currentPage: number, totalPages: number): number[] {
    const pages: number[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else { pages.push(1); const s = Math.max(2, currentPage - 2); const e = Math.min(totalPages - 1, currentPage + 2); if (s > 2) pages.push(-1); for (let i = s; i <= e; i++) pages.push(i); if (e < totalPages - 1) pages.push(-1); pages.push(totalPages); }
    return pages;
  }
  formatDate(date: Date | string): string { if (!date) return ''; return new Date(date).toLocaleString('en-IE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  getCategoryDisplay(category: string | null | undefined): string {
    const key = category ?? '';
    return ({ initial_enquiry: 'Initial Enquiry', site_visit_meeting: 'Site Visit', invoice_due: 'Invoice Due', quote_creation: 'Quote Request', showroom_booking: 'Showroom', complaint: 'Complaint', general_inquiry: 'General', junk: 'Junk' } as Record<string,string>)[key] || key;
  }
  onKeyDown(event: KeyboardEvent, task: EmailTaskExtended): void { if (event.key === 'Enter') this.onRowDoubleClick(task); }
  onContextMenu(event: MouseEvent, _task: EmailTaskExtended): void { event.preventDefault(); }

  get searchTerm(): string               { return this.searchTermSubject.value; }
  set searchTerm(v: string)              { this.searchTermSubject.next(v); }
  get filterPriority(): string           { return this.filterPrioritySubject.value; }
  set filterPriority(v: string)          { this.filterPrioritySubject.next(v); }
  get filterAssignedUser(): number|null  { return this.filterAssignedUserSubject.value; }
  set filterAssignedUser(v: number|null) { this.filterAssignedUserSubject.next(v); }
  get currentPage(): number              { return this.currentPageSubject.value; }
  set currentPage(v: number)             { this.currentPageSubject.next(v); }
  get pageSize(): number                 { return this.pageSizeSubject.value; }
  set pageSize(v: number)                { this.pageSizeSubject.next(v); }
  get sortBy():        string            { return this.sortBySubject.value; }
  get sortDirection(): 'ASC' | 'DESC'    { return this.sortDirectionSubject.value; }

  private _tryLinkNewestWorkflowToTask(pending: { taskId: number; category: string; incomingEmailId: number }): void {
    this.emailTaskService.getTaskById(pending.taskId).pipe(take(1), catchError(e => { console.warn(e); return of(null); }))
      .subscribe(task => {
        if (!task?.customerId) return;
        this.workflowService.getWorkflowsForCustomer(task.customerId).pipe(take(1), catchError(() => of([])))
          .subscribe((wfs: WorkflowDto[]) => {
            if (!wfs?.length) return;
            const newest = wfs.reduce((a, b) => a.workflowId > b.workflowId ? a : b);
            this.emailTaskService.linkWorkflowToTask(pending.taskId, newest.workflowId).pipe(take(1), catchError(() => of(null)))
              .subscribe(() => { this.refreshTrigger.next(); this.cdr.markForCheck(); });
          });
      });
  }
}