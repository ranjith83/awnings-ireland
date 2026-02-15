import { Component, OnInit, ChangeDetectionStrategy, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EmailTaskService, EmailTask, User, PaginatedResponse, PageInfo, TaskFilterParams } from '../service/email-task.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { map, switchMap, catchError, shareReplay, tap, startWith } from 'rxjs/operators';

export interface EmailAttachment {
  attachmentId: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  blobUrl: string;
}

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

  // ==================== REACTIVE STATE (Subjects) ====================
  private activeTabSubject = new BehaviorSubject<'tasks' | 'processed' | 'junk'>('tasks');
  private currentPageSubject = new BehaviorSubject<number>(1);
  private pageSizeSubject = new BehaviorSubject<number>(20);
  private searchTermSubject = new BehaviorSubject<string>('');
  private sortBySubject = new BehaviorSubject<string>('DateAdded');
  private sortDirectionSubject = new BehaviorSubject<'ASC' | 'DESC'>('DESC');
  private filterPrioritySubject = new BehaviorSubject<string>('');
  private filterAssignedUserSubject = new BehaviorSubject<number | null>(null);
  private refreshTrigger = new BehaviorSubject<void>(undefined);

  // ==================== OBSERVABLES (For Template with async pipe) ====================
  
  // Active tab
  activeTab$ = this.activeTabSubject.asObservable();
  
  // Current page info
  currentPage$ = this.currentPageSubject.asObservable();
  pageSize$ = this.pageSizeSubject.asObservable();
  
  // Filters
  searchTerm$ = this.searchTermSubject.asObservable();
  filterPriority$ = this.filterPrioritySubject.asObservable();
  filterAssignedUser$ = this.filterAssignedUserSubject.asObservable();

  // Combined filter state
  private filters$ = combineLatest([
    this.activeTabSubject,
    this.currentPageSubject,
    this.pageSizeSubject,
    this.searchTermSubject,
    this.sortBySubject,
    this.sortDirectionSubject,
    this.filterPrioritySubject,
    this.filterAssignedUserSubject,
    this.refreshTrigger
  ]).pipe(
    map(([activeTab, page, pageSize, searchTerm, sortBy, sortDirection, priority, assignedUser]) => ({
      status: this.getStatusFromTab(activeTab),
      page,
      pageSize,
      sortBy,
      sortDirection,
      searchTerm: searchTerm || undefined,
      priority: priority || undefined,
      assignedToUserId: assignedUser || undefined
    }))
  );

  // Main data stream - will be initialized in ngOnInit
  private tasksResponse$!: Observable<PaginatedResponse<EmailTask>>;

  // Derived observables - will be initialized in ngOnInit
  tasks$!: Observable<EmailTask[]>;
  pageInfo$!: Observable<PageInfo>;
  totalItems$!: Observable<number>;
  totalPages$!: Observable<number>;
  pageNumbers$!: Observable<number[]>;

  // Loading state
  isLoading$ = new BehaviorSubject<boolean>(false);

  // Users and current user - will be initialized in ngOnInit
  users$!: Observable<User[]>;
  currentUser$!: Observable<User | null>;

  // ==================== NON-REACTIVE STATE (For Email Viewer) ====================
  selectedTask: EmailTask | null = null;
  showEmailViewer: boolean = false;
  activeEmailTab: 'email' | 'attachments' = 'email';
  selectedAssignee: number | null = null;
  selectedAction: string = '';

  // Constants
  pageSizeOptions: number[] = [10, 20, 50, 100];
  today: Date = new Date();
  Math = Math;

  availableActions = [
    { value: 'add_company', label: 'Add Company' },
    { value: 'generate_quote', label: 'Generate Quote' },
    { value: 'generate_invoice', label: 'Generate Invoice' },
    { value: 'add_site_visit', label: 'Add Site Visit' },
    { value: 'move_to_junk', label: 'Move to Junk' }
  ];

  constructor(
    private emailTaskService: EmailTaskService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    // Initialize observables that depend on injected services
    this.initializeDataStreams();
  }

  private initializeDataStreams(): void {
    // Main data stream - loads tasks based on filters
    this.tasksResponse$ = this.filters$.pipe(
      switchMap(filters => {
        console.log('📥 Loading tasks with filters:', filters);
        return this.emailTaskService.getTasksPaginated(filters).pipe(
          tap(response => console.log('✅ Received:', response.tasks.length, 'tasks')),
          catchError(error => {
            console.error('❌ Error loading tasks:', error);
            return of({ tasks: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 0 });
          })
        );
      }),
      shareReplay(1) // Cache latest response
    );

    // Derived observables from response
    this.tasks$ = this.tasksResponse$.pipe(
      map(response => response.tasks)
    );

    this.pageInfo$ = this.tasksResponse$.pipe(
      map(response => this.emailTaskService.getPageInfo(response))
    );

    this.totalItems$ = this.tasksResponse$.pipe(map(r => r.totalCount));
    this.totalPages$ = this.tasksResponse$.pipe(map(r => r.totalPages));

    // Page numbers for pagination
    this.pageNumbers$ = combineLatest([
      this.currentPageSubject,
      this.totalPages$
    ]).pipe(
      map(([currentPage, totalPages]) => this.calculatePageNumbers(currentPage, totalPages))
    );

    // Users list
    this.users$ = this.emailTaskService.getUsers().pipe(
      catchError(() => of([])),
      shareReplay(1)
    );

    // Current user
    this.currentUser$ = this.emailTaskService.getCurrentUser().pipe(
      catchError(() => of(null)),
      shareReplay(1)
    );
  }

  // ==================== STATE UPDATES (Trigger reactive streams) ====================

  setActiveTab(tab: 'tasks' | 'processed' | 'junk'): void {
    this.activeTabSubject.next(tab);
    this.currentPageSubject.next(1); // Reset to page 1
  }

  goToPage(page: number): void {
    this.currentPageSubject.next(page);
  }

  nextPage(): void {
    const current = this.currentPageSubject.value;
    const total = this.totalPages$.pipe(map(t => t)).subscribe(totalPages => {
      if (current < totalPages) {
        this.currentPageSubject.next(current + 1);
      }
    });
  }

  previousPage(): void {
    const current = this.currentPageSubject.value;
    if (current > 1) {
      this.currentPageSubject.next(current - 1);
    }
  }

  firstPage(): void {
    this.currentPageSubject.next(1);
  }

  lastPage(): void {
    this.totalPages$.subscribe(totalPages => {
      this.currentPageSubject.next(totalPages);
    }).unsubscribe();
  }

  changePageSize(newSize: number): void {
    this.pageSizeSubject.next(newSize);
    this.currentPageSubject.next(1);
  }

  applySearch(): void {
    // searchTerm is already bound via [(ngModel)] in template
    // Just trigger refresh
    this.currentPageSubject.next(1);
    this.refreshTrigger.next();
  }

  clearSearch(): void {
    this.searchTermSubject.next('');
    this.currentPageSubject.next(1);
  }

  applyFilters(): void {
    this.currentPageSubject.next(1);
    this.refreshTrigger.next();
  }

  clearFilters(): void {
    this.filterPrioritySubject.next('');
    this.filterAssignedUserSubject.next(null);
    this.currentPageSubject.next(1);
  }

  sortByColumn(column: string): void {
    const currentSort = this.sortBySubject.value;
    const currentDirection = this.sortDirectionSubject.value;

    if (currentSort === column) {
      this.sortDirectionSubject.next(currentDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      this.sortBySubject.next(column);
      this.sortDirectionSubject.next('DESC');
    }
  }

  getSortIndicator(column: string): string {
    const currentSort = this.sortBySubject.value;
    const currentDirection = this.sortDirectionSubject.value;
    
    if (currentSort !== column) return '';
    return currentDirection === 'ASC' ? '↑' : '↓';
  }

  // Update search/filter from template
  updateSearchTerm(term: string): void {
    this.searchTermSubject.next(term);
  }

  updateFilterPriority(priority: string): void {
    this.filterPrioritySubject.next(priority);
  }

  updateFilterAssignedUser(userId: number | null): void {
    this.filterAssignedUserSubject.next(userId);
  }

  // ==================== EMAIL VIEWER (Non-Reactive) ====================

  onRowDoubleClick(task: EmailTask): void {
    this.selectedTask = task;
    this.showEmailViewer = true;
    this.activeEmailTab = 'email';
    this.selectedAssignee = task.assignedToUserId;
  }

  closeEmailViewer(): void {
    this.showEmailViewer = false;
    this.selectedTask = null;
    this.selectedAction = '';
    this.selectedAssignee = null;
  }

  setEmailTab(tab: 'email' | 'attachments'): void {
    this.activeEmailTab = tab;
  }

  save(): void {
    if (!this.selectedTask) return;

    const promises: Promise<any>[] = [];

    if (this.selectedAssignee && this.selectedAssignee !== this.selectedTask.assignedToUserId) {
      promises.push(
        this.emailTaskService.assignTask(this.selectedTask.taskId, this.selectedAssignee).toPromise()
      );
    }

    if (this.selectedAction) {
      promises.push(
        this.emailTaskService.executeAction(this.selectedTask.taskId, this.selectedAction).toPromise()
      );
    }

    Promise.all(promises).then(() => {
      console.log('✅ Task updated');
      this.closeEmailViewer();
      this.refreshTrigger.next(); // Refresh the list
    }).catch(error => {
      console.error('❌ Error:', error);
    });
  }

  downloadAttachment(attachment: EmailAttachment): void {
    if (this.isBrowser && attachment.blobUrl) {
      window.open(attachment.blobUrl, '_blank');
    }
  }

  createNewTask(): void {
    console.log('Create new task');
  }

  // ==================== HELPER METHODS ====================

  private getStatusFromTab(tab: 'tasks' | 'processed' | 'junk'): string {
    switch (tab) {
      case 'tasks': return 'Pending';
      case 'processed': return 'Processed';
      case 'junk': return 'Junk';
      default: return 'Pending';
    }
  }

  private calculatePageNumbers(currentPage: number, totalPages: number): number[] {
    const pages: number[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 2);
      let end = Math.min(totalPages - 1, currentPage + 2);
      if (start > 2) pages.push(-1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) pages.push(-1);
      pages.push(totalPages);
    }
    return pages;
  }

  formatDate(date: Date | string): string {
    if (!date) return '';
    return new Date(date).toLocaleString('en-IE', { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getCategoryDisplay(category: string): string {
    const map: any = {
      'initial_enquiry': 'Initial Enquiry',
      'site_visit_meeting': 'Site Visit',
      'invoice_due': 'Invoice Due',
      'quote_creation': 'Quote Request',
      'showroom_booking': 'Showroom',
      'complaint': 'Complaint',
      'general_inquiry': 'General',
      'junk': 'Junk'
    };
    return map[category] || category;
  }

  onKeyDown(event: KeyboardEvent, task: EmailTask): void {
    if (event.key === 'Enter') {
      this.onRowDoubleClick(task);
    }
  }

  onContextMenu(event: MouseEvent, task: EmailTask): void {
    event.preventDefault();
  }

  // ==================== TEMPLATE HELPER OBSERVABLES ====================

  // Current active tab as string for template
  get activeTab(): 'tasks' | 'processed' | 'junk' {
    return this.activeTabSubject.value;
  }

  // For two-way binding in template
  get searchTerm(): string {
    return this.searchTermSubject.value;
  }
  set searchTerm(value: string) {
    this.searchTermSubject.next(value);
  }

  get filterPriority(): string {
    return this.filterPrioritySubject.value;
  }
  set filterPriority(value: string) {
    this.filterPrioritySubject.next(value);
  }

  get filterAssignedUser(): number | null {
    return this.filterAssignedUserSubject.value;
  }
  set filterAssignedUser(value: number | null) {
    this.filterAssignedUserSubject.next(value);
  }

  get currentPage(): number {
    return this.currentPageSubject.value;
  }
  set currentPage(value: number) {
    this.currentPageSubject.next(value);
  }

  get pageSize(): number {
    return this.pageSizeSubject.value;
  }
  set pageSize(value: number) {
    this.pageSizeSubject.next(value);
  }

  get sortBy(): string {
    return this.sortBySubject.value;
  }

  get sortDirection(): 'ASC' | 'DESC' {
    return this.sortDirectionSubject.value;
  }
}