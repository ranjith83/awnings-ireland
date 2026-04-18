import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../app/environments/environment';

// ==================== INTERFACES ====================

export interface EmailTask {
  // ── Core identity ──────────────────────────────────────────────────────────
  taskId:           number;

  /**
   * Discriminator added in the Tasks table migration.
   * 'Email' | 'SiteVisit' | 'Manual'
   * All existing rows default to 'Email'.
   */
  sourceType:       string;

  /**
   * Human-readable display title computed server-side:
   *   Title ?? Subject ?? '(No title)'
   * Email tasks: matches subject.
   * SiteVisit / Manual tasks: set explicitly on creation.
   */
  displayTitle:     string;

  // ── Email-origin fields (null / empty for non-email tasks) ─────────────────
  incomingEmailId?: number | null;
  fromName?:        string;
  fromEmail?:       string;
  subject?:         string;

  // ── Common fields ──────────────────────────────────────────────────────────
  category:         string;
  status:           string;
  taskType:         string;
  priority:         string;

  // ── Dates ─────────────────────────────────────────────────────────────────
  dateAdded:        Date;
  dueDate?:         Date;
  dateCreated?:     Date;
  dateUpdated?:     Date;
  dateProcessed?:   Date;
  completedDate?:   Date;

  // ── Assignment ────────────────────────────────────────────────────────────
  assignedTo?:             string | null;   // alias kept for template compat
  assignedToUserId?:       number | null;
  assignedToUserName?:     string | null;
  assignedByUserId?:       number | null;
  assignedByUserName?:     string | null;

  // ── Customer / company ────────────────────────────────────────────────────
  companyNumber?:   string | null;
  customerId?:      number | null;
  customerName?:    string | null;
  customerEmail?:   string | null;
  workflowId?:      number | null;
  quoteId?:         number | null;

  // ── Content ───────────────────────────────────────────────────────────────
  emailBody?:       string;
  hasAttachments:   boolean;
  selectedAction?:  string | null;

  // ── Site Visit deep-link ──────────────────────────────────────────────────
  /**
   * Populated only when sourceType === 'SiteVisit'.
   * The Angular card / row uses this to navigate to /site-visit/:siteVisitId.
   */
  siteVisitId?:     number | null;

  // ── Processing / completion ───────────────────────────────────────────────
  processedBy?:     string | null;
  completedBy?:     string | null;
  completionNotes?: string | null;

  // ── AI / extracted data ───────────────────────────────────────────────────
  aiConfidence?:    number;
  aiReasoning?:     string | null;
  extractedData?:   any;

  // ── Audit trail ───────────────────────────────────────────────────────────
  createdBy?:       string | null;
  updatedBy?:       string | null;

  // ── Relations ─────────────────────────────────────────────────────────────
  attachments?:     EmailAttachment[];
  comments?:        any[];
  history?:         any[];
}

export interface EmailAttachment {
  attachmentId:  number;
  fileName:      string;
  fileSize:      number;
  fileType:      string;
  blobUrl:       string;
  extractedText?: string;
}

export interface User {
  userId:      number;
  username:    string;
  email:       string;
  firstName:   string;
  lastName:    string;
  role:        string;
  department?: string;
}

export interface TaskStatistics {
  totalTasks:      number;
  pendingTasks:    number;
  processedTasks:  number;
  junkTasks:       number;
  myTasks:         number;
  overdueTasks:    number;
  dueTodayTasks:   number;
}

/** A single file attachment carried in an email send request. */
export interface EmailAttachmentPayload {
  fileName:      string;  // e.g. "Quote-001.pdf"
  base64Content: string;  // base64, no data-URI prefix
  contentType:   string;  // e.g. "application/pdf"
}

export interface SendTaskEmailPayload {
  toEmail?:               string;
  toName?:                string;
  subject:                string;
  body:                   string;
  originalEmailGraphId?:  string | null;
  attachments?:           EmailAttachmentPayload[];
}

export interface SendDirectEmailPayload {
  toEmail:       string;
  toName?:       string;
  subject:       string;
  body:          string;
  attachments?:  EmailAttachmentPayload[];
}

// ==================== PAGINATION INTERFACES ====================

export interface TaskFilterParams {
  page:                number;
  pageSize:            number;
  sortBy?:             string | null;
  sortDirection?:      'ASC' | 'DESC' | null;

  // ── Source type filter (new) ───────────────────────────────────────────────
  /**
   * Single source filter.  Pass 'Email' on the Email Tasks tab so that
   * site-visit and manual tasks are excluded from this screen.
   * Leave null/undefined to return all sources (used on the All Tasks screen).
   */
  sourceType?:         string | null;

  /**
   * Multi-source filter — overrides sourceType when set.
   * e.g. ['Email'] keeps only email-originated tasks.
   */
  sourceTypes?:        string[] | null;

  // ── Existing filters (unchanged) ──────────────────────────────────────────
  status?:             string | null;
  taskType?:           string | null;
  priority?:           string | null;
  assignedToUserId?:   number | null;
  customerId?:         number | null;
  dueDateFrom?:        Date | null;
  dueDateTo?:          Date | null;
  createdDateFrom?:    Date | null;
  createdDateTo?:      Date | null;
  searchTerm?:         string | null;
}

export interface PaginatedResponse<T> {
  tasks:       T[];
  totalCount:  number;
  page:        number;
  pageSize:    number;
  totalPages:  number;
}

export interface PageInfo {
  currentPage:       number;
  pageSize:          number;
  totalItems:        number;
  totalPages:        number;
  hasNextPage:       boolean;
  hasPreviousPage:   boolean;
}

export interface ExtractedCustomerData {
  taskId:             number;
  email?:             string;
  fromName?:          string;
  companyNumber?:     string;
  subject?:           string;
  customerName?:      string;
  contactFirstName?:  string;
  contactLastName?:   string;
}

export interface CustomerExistsResponse {
  exists:          boolean;
  customerId?:     number;
  customerName?:   string;
  email?:          string;
  companyNumber?:  string;
}


// ==================== SERVICE ====================

@Injectable({
  providedIn: 'root'
})
export class EmailTaskService {
  // ── API URL stays /api/EmailTask — the controller route has not changed ────
  private apiUrl = `${environment.apiUrl}/api/EmailTask`;

  constructor(private http: HttpClient) { }

  // ==================== PAGINATION METHODS ====================

  /**
   * Get tasks with pagination and filtering.
   * Passes sourceType so the Email Tasks screen only returns email-originated tasks.
   */
  getTasksPaginated(filters: Partial<TaskFilterParams>): Observable<PaginatedResponse<EmailTask>> {
    const requestBody = {
      page:              filters.page              ?? 1,
      pageSize:          filters.pageSize          ?? 20,
      status:            filters.status            ?? '',
      taskType:          filters.taskType          ?? '',
      priority:          filters.priority          ?? '',
      searchTerm:        filters.searchTerm        ?? '',
      sortBy:            filters.sortBy            ?? 'DateAdded',
      sortDirection:     filters.sortDirection      ?? 'DESC',
      assignedToUserId:  filters.assignedToUserId  ?? null,
      customerId:        filters.customerId         ?? null,
      dueDateFrom:       filters.dueDateFrom        ? filters.dueDateFrom.toISOString()    : null,
      dueDateTo:         filters.dueDateTo          ? filters.dueDateTo.toISOString()      : null,
      createdDateFrom:   filters.createdDateFrom    ? filters.createdDateFrom.toISOString(): null,
      createdDateTo:     filters.createdDateTo      ? filters.createdDateTo.toISOString()  : null,
      // ── New source type fields ───────────────────────────────────────────
      sourceType:        filters.sourceType        ?? null,
      sourceTypes:       filters.sourceTypes        ?? null,
    };

    return this.http.post<PaginatedResponse<EmailTask>>(
      `${this.apiUrl}/search`,
      requestBody
    );
  }

  /**
   * Fetch only Email-originated tasks (sourceType = 'Email').
   * Used by the Email Tasks screen to exclude SiteVisit / Manual tasks.
   */
  getEmailTasksPaginated(
    filters: Partial<Omit<TaskFilterParams, 'sourceType' | 'sourceTypes'>>
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({ ...filters, sourceTypes: ['Email'] });
  }

  getTasksByStatusPaginated(
    status: string,
    page = 1,
    pageSize = 20,
    sortBy = 'DateAdded',
    sortDirection: 'ASC' | 'DESC' = 'DESC'
  ): Observable<PaginatedResponse<EmailTask>> {
    // Scoped to Email source — this screen is the email inbox
    return this.getTasksPaginated({ status, page, pageSize, sortBy, sortDirection, sourceTypes: ['Email'] });
  }

  getTasksByUserPaginated(
    userId: number,
    page = 1,
    pageSize = 20
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({
      assignedToUserId: userId, page, pageSize,
      sortBy: 'DateAdded', sortDirection: 'DESC',
      sourceTypes: ['Email']
    });
  }

  searchTasks(
    searchTerm: string,
    page = 1,
    pageSize = 20
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({
      searchTerm, page, pageSize,
      sortBy: 'DateAdded', sortDirection: 'DESC',
      sourceTypes: ['Email']
    });
  }

  // ==================== ORIGINAL METHODS (Non-Paginated) ====================

  getTasks(status: string): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/status/${status}`);
  }

  getTaskById(taskId: number): Observable<EmailTask> {
    return this.http.get<EmailTask>(`${this.apiUrl}/${taskId}`);
  }

  getTasksByUser(userId: number): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/user/${userId}`);
  }

  getTasksByCategory(category: string): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/category/${category}`);
  }

  getTasksByCustomer(customerId: number): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/customer/${customerId}`);
  }

  /** Convenience alias — named to clarify intent in the Initial Enquiry component. */
  getTasksByCustomer_AsRows(customerId: number): Observable<EmailTask[]> {
    return this.getTasksByCustomer(customerId);
  }

  getOverdueTasks(): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/overdue`);
  }

  getTasksDueToday(): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/due-today`);
  }

  // ==================== TASK ACTIONS ====================

  assignTask(taskId: number, userId: number, notes?: string): Observable<EmailTask> {
    return this.http.put<EmailTask>(`${this.apiUrl}/${taskId}/assign`, { assignedToUserId: userId, notes });
  }

  unassignTask(taskId: number): Observable<EmailTask> {
    return this.http.put<EmailTask>(`${this.apiUrl}/${taskId}/unassign`, {});
  }

  updateTaskStatus(taskId: number, status: string, completionNotes?: string): Observable<EmailTask> {
    return this.http.put<EmailTask>(`${this.apiUrl}/${taskId}/status`, { status, completionNotes });
  }

  completeTask(taskId: number, completionNotes?: string): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/complete`, { completionNotes });
  }

  updateTask(taskId: number, updateData: any): Observable<EmailTask> {
    return this.http.put<EmailTask>(`${this.apiUrl}/${taskId}`, updateData);
  }

  createTask(task: any): Observable<EmailTask> {
    return this.http.post<EmailTask>(this.apiUrl, task);
  }

  createTaskFromEmail(incomingEmailId: number): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/from-email/${incomingEmailId}`, {});
  }

  deleteTask(taskId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${taskId}`);
  }

  executeAction(taskId: number, action: string, data?: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${taskId}/action/${action}`, { action, data });
  }

  // ==================== COMMENTS ====================

  getTaskComments(taskId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${taskId}/comments`);
  }

  addComment(taskId: number, comment: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${taskId}/comments`, { commentText: comment });
  }

  deleteComment(commentId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/comments/${commentId}`);
  }

  // ==================== HISTORY ====================

  getTaskHistory(taskId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${taskId}/history`);
  }

  // ==================== STATISTICS ====================

  getStatistics(): Observable<TaskStatistics> {
    return this.http.get<TaskStatistics>(`${this.apiUrl}/statistics`);
  }

  getUserStatistics(userId: number): Observable<TaskStatistics> {
    return this.http.get<TaskStatistics>(`${this.apiUrl}/statistics/user/${userId}`);
  }

  getMyStatistics(): Observable<TaskStatistics> {
    return this.http.get<TaskStatistics>(`${this.apiUrl}/statistics/my-stats`);
  }

  // ==================== USER METHODS ====================

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/api/Auth/me`);
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${environment.apiUrl}/api/Auth/users`);
  }

  // ==================== HELPER METHODS ====================

  getPageInfo(response: PaginatedResponse<any>): PageInfo {
    return {
      currentPage:     response.page,
      pageSize:        response.pageSize,
      totalItems:      response.totalCount,
      totalPages:      response.totalPages,
      hasNextPage:     response.page < response.totalPages,
      hasPreviousPage: response.page > 1
    };
  }

  // ==================== TASK AUDIT ====================

  getTaskAuditHistory(page = 1, pageSize = 20, action?: string): Observable<any> {
    let url = `${this.apiUrl}/audit?page=${page}&pageSize=${pageSize}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    return this.http.get<any>(url);
  }

  /** @deprecated Use getTaskAuditHistory instead */
  getTaskAuditLogs(page = 1, pageSize = 20, action?: string): Observable<any> {
    return this.getTaskAuditHistory(page, pageSize, action);
  }

  // ==================== CUSTOMER LINKAGE ====================

  getExtractedCustomerData(taskId: number): Observable<ExtractedCustomerData> {
    return this.http.get<ExtractedCustomerData>(`${this.apiUrl}/${taskId}/extracted-customer-data`);
  }

  checkCustomerExists(request: { email?: string; companyNumber?: string }): Observable<CustomerExistsResponse> {
    return this.http.post<CustomerExistsResponse>(`${this.apiUrl}/check-customer-exists`, request);
  }

  linkCustomerToTask(taskId: number, customerId: number): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/link-customer`, { customerId });
  }

  linkWorkflowToTask(taskId: number, workflowId: number): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/link-workflow`, { workflowId });
  }

  // ==================== EMAIL SENDING ====================

  sendTaskEmail(taskId: number, payload: SendTaskEmailPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/${taskId}/send-email`,
      payload
    );
  }

  sendDirectEmail(payload: SendDirectEmailPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/send-direct`,
      payload
    );
  }

  // ==================== SOURCE TYPE HELPERS ====================

  isSiteVisitTask(task: EmailTask): boolean {
    return task.sourceType === 'SiteVisit' && !!task.siteVisitId;
  }

  isEmailTask(task: EmailTask): boolean {
    return task.sourceType === 'Email';
  }

  getSourceTypeLabel(task: EmailTask): string {
    const map: Record<string, string> = {
      Email:     'Email',
      SiteVisit: 'Site Visit',
      Manual:    'Manual',
    };
    return map[task.sourceType] ?? task.sourceType;
  }
}