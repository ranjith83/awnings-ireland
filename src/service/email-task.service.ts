import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../app/environments/environment';

// ==================== INTERFACES ====================

export interface EmailTask {
  // ── Core identity ──────────────────────────────────────────────────────────
  taskId:           number;
  incomingEmailId:  number;
  fromName:         string;
  fromEmail:        string;
  subject:          string;
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
  assignedTo?:          string | null;
  assignedToUserId?:    number | null;
  assignedToUserName?:  string | null;
  assignedByUserId?:    number | null;
  assignedByUserName?:  string | null;

  // ── Customer / company ────────────────────────────────────────────────────
  companyNumber?:   string | null;
  customerId?:      number | null;
  customerName?:    string | null;
  customerEmail?:   string | null;
  workflowId?:      number | null;
  quoteId?:         number | null;

  // ── Content ───────────────────────────────────────────────────────────────
  emailBody:        string;
  hasAttachments:   boolean;
  selectedAction?:  string | null;

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
  attachmentId: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  blobUrl: string;
  extractedText?: string;
}

export interface User {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
}

export interface TaskStatistics {
  totalTasks: number;
  pendingTasks: number;
  processedTasks: number;
  junkTasks: number;
  myTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
}

export interface SendTaskEmailPayload {
  toEmail?:               string;
  toName?:                string;
  subject:                string;
  body:                   string;
  originalEmailGraphId?:  string | null;
}

/** Payload for POST /api/EmailTask/send-direct — no task context required. */
export interface SendDirectEmailPayload {
  toEmail:  string;
  toName?:  string;
  subject:  string;
  body:     string;
}

// ==================== PAGINATION INTERFACES ====================

export interface TaskFilterParams {
  page: number;
  pageSize: number;
  sortBy?: string | null;
  sortDirection?: 'ASC' | 'DESC' | null;
  status?: string | null;
  taskType?: string | null;
  priority?: string | null;
  assignedToUserId?: number | null;
  customerId?: number | null;
  dueDateFrom?: Date | null;
  dueDateTo?: Date | null;
  createdDateFrom?: Date | null;
  createdDateTo?: Date | null;
  searchTerm?: string | null;
}

export interface PaginatedResponse<T> {
  tasks: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PageInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ExtractedCustomerData {
  taskId: number;
  email?: string;
  fromName?: string;
  companyNumber?: string;
  subject?: string;
  customerName?: string;
  contactFirstName?: string;
  contactLastName?: string;
}

export interface CustomerExistsResponse {
  exists: boolean;
  customerId?: number;
  customerName?: string;
  email?: string;
  companyNumber?: string;
}


// ==================== SERVICE ====================

@Injectable({
  providedIn: 'root'
})
export class EmailTaskService {
  private apiUrl = `${environment.apiUrl}/api/EmailTask`;

  constructor(private http: HttpClient) { }

  // ==================== PAGINATION METHODS ====================

  /**
   * Get tasks with pagination and filtering
   */
  getTasksPaginated(filters: Partial<TaskFilterParams>): Observable<PaginatedResponse<EmailTask>> {
    const requestBody = {
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 20,
      status: filters.status ?? '',
      taskType: filters.taskType ?? '',
      priority: filters.priority ?? '',
      searchTerm: filters.searchTerm ?? '',
      sortBy: filters.sortBy ?? 'DateAdded',
      sortDirection: filters.sortDirection ?? 'DESC',
      assignedToUserId: filters.assignedToUserId ?? null,
      customerId: filters.customerId ?? null,
      dueDateFrom: filters.dueDateFrom ? filters.dueDateFrom.toISOString() : null,
      dueDateTo: filters.dueDateTo ? filters.dueDateTo.toISOString() : null,
      createdDateFrom: filters.createdDateFrom ? filters.createdDateFrom.toISOString() : null,
      createdDateTo: filters.createdDateTo ? filters.createdDateTo.toISOString() : null
    };

    return this.http.post<PaginatedResponse<EmailTask>>(
      `${this.apiUrl}/search`,
      requestBody
    );
  }

  getTasksByStatusPaginated(
    status: string,
    page = 1,
    pageSize = 20,
    sortBy = 'DateAdded',
    sortDirection: 'ASC' | 'DESC' = 'DESC'
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({ status, page, pageSize, sortBy, sortDirection });
  }

  getTasksByUserPaginated(userId: number, page = 1, pageSize = 20): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({ assignedToUserId: userId, page, pageSize, sortBy: 'DateAdded', sortDirection: 'DESC' });
  }

  searchTasks(searchTerm: string, page = 1, pageSize = 20): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({ searchTerm, page, pageSize, sortBy: 'DateAdded', sortDirection: 'DESC' });
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

  /**
   * Get all email tasks for a specific customer.
   * Maps to: GET /api/EmailTask/customer/{customerId}
   */
  getTasksByCustomer(customerId: number): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/customer/${customerId}`);
  }

  /**
   * Convenience wrapper – same as getTasksByCustomer but named
   * to make the intent clear when used in the Initial Enquiry component.
   * Returns the raw EmailTask[] which the component maps to CustomerEmailRow[].
   */
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
    return this.http.patch<EmailTask>(`${this.apiUrl}/${taskId}/status`, { status, completionNotes });
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
      currentPage: response.page,
      pageSize: response.pageSize,
      totalItems: response.totalCount,
      totalPages: response.totalPages,
      hasNextPage: response.page < response.totalPages,
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

  /**
   * Links a newly created workflow back to an email task.
   * POST /api/EmailTask/{taskId}/link-workflow
   */
  linkWorkflowToTask(taskId: number, workflowId: number): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/link-workflow`, { workflowId });
  }

  /**
   * Send an email from within a task context.
   * POST /api/EmailTask/{taskId}/send-email
   */
  sendTaskEmail(taskId: number, payload: SendTaskEmailPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/${taskId}/send-email`,
      payload
    );
  }

  /**
   * Send a fresh outbound email with no task context.
   * Uses POST /api/EmailTask/send-direct — taskId not required.
   * Always sends as a new email (never threaded).
   */
  sendDirectEmail(payload: SendDirectEmailPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/send-direct`,
      payload
    );
  }
}