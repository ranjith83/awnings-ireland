import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../app/environments/environment';

// ==================== INTERFACES ====================

export interface EmailTask {
  taskId: number;
  incomingEmailId: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  category: string;
  dateAdded: Date;
  status: string;
  taskType: string;
  priority: string;
  assignedTo: string | null;
  assignedToUserId: number | null;
  companyNumber: string | null;
  emailBody: string;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  aiConfidence?: number;
  extractedData?: any;
  customerName?: string;
  dueDate?: Date;
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
   * FIXED: Sends proper request body with all fields having explicit defaults
   */
  getTasksPaginated(filters: Partial<TaskFilterParams>): Observable<PaginatedResponse<EmailTask>> {
    // Build request body matching backend TaskFilterDto exactly
    // Backend expects empty strings for string fields, NOT null
    const requestBody = {
      // Required pagination fields
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 20,
      
      // String fields - MUST BE EMPTY STRING (not null) if not provided
      status: filters.status ?? '',
      taskType: filters.taskType ?? '',
      priority: filters.priority ?? '',
      searchTerm: filters.searchTerm ?? '',
      sortBy: filters.sortBy ?? 'DateAdded',
      sortDirection: filters.sortDirection ?? 'DESC',
      
      // Nullable int fields - can be null
      assignedToUserId: filters.assignedToUserId ?? null,
      customerId: filters.customerId ?? null,
      
      // Nullable DateTime fields - can be null
      dueDateFrom: filters.dueDateFrom ? filters.dueDateFrom.toISOString() : null,
      dueDateTo: filters.dueDateTo ? filters.dueDateTo.toISOString() : null,
      createdDateFrom: filters.createdDateFrom ? filters.createdDateFrom.toISOString() : null,
      createdDateTo: filters.createdDateTo ? filters.createdDateTo.toISOString() : null
    };

    console.log('📤 Sending pagination request:', requestBody);

    return this.http.post<PaginatedResponse<EmailTask>>(
      `${this.apiUrl}/search`,
      requestBody
    );
  }

  /**
   * Get tasks by status with pagination
   */
  getTasksByStatusPaginated(
    status: string,
    page: number = 1,
    pageSize: number = 20,
    sortBy: string = 'DateAdded',
    sortDirection: 'ASC' | 'DESC' = 'DESC'
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({
      status,
      page,
      pageSize,
      sortBy,
      sortDirection
    });
  }

  /**
   * Get tasks assigned to user with pagination
   */
  getTasksByUserPaginated(
    userId: number,
    page: number = 1,
    pageSize: number = 20
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({
      assignedToUserId: userId,
      page,
      pageSize,
      sortBy: 'DateAdded',
      sortDirection: 'DESC'
    });
  }

  /**
   * Search tasks with pagination
   */
  searchTasks(
    searchTerm: string,
    page: number = 1,
    pageSize: number = 20
  ): Observable<PaginatedResponse<EmailTask>> {
    return this.getTasksPaginated({
      searchTerm,
      page,
      pageSize,
      sortBy: 'DateAdded',
      sortDirection: 'DESC'
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

  getOverdueTasks(): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/overdue`);
  }

  getTasksDueToday(): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/due-today`);
  }

  // ==================== TASK ACTIONS ====================

  assignTask(taskId: number, userId: number, notes?: string): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/assign`, {
      assignedToUserId: userId,
      notes
    });
  }

  unassignTask(taskId: number): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/unassign`, {});
  }

  updateTaskStatus(taskId: number, status: string, completionNotes?: string): Observable<EmailTask> {
    return this.http.patch<EmailTask>(`${this.apiUrl}/${taskId}/status`, {
      status,
      completionNotes
    });
  }

  completeTask(taskId: number, completionNotes?: string): Observable<EmailTask> {
    return this.http.post<EmailTask>(`${this.apiUrl}/${taskId}/complete`, {
      completionNotes
    });
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
    return this.http.post(`${this.apiUrl}/${taskId}/action/${action}`, {
      action,
      data
    });
  }

  // ==================== COMMENTS ====================

  getTaskComments(taskId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${taskId}/comments`);
  }

  addComment(taskId: number, comment: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${taskId}/comments`, {
      commentText: comment
    });
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
}