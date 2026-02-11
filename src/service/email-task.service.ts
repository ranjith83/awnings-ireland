import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../app/environments/environment';

export interface EmailTask {
  taskId: number;
  incomingEmailId: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  category: string;
  dateAdded: Date;
  status: string;
  assignedTo: string | null;
  assignedToUserId: number | null;
  companyNumber: string | null;
  emailBody: string;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
  aiConfidence?: number;
  extractedData?: any;
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
}

@Injectable({
  providedIn: 'root'
})
export class EmailTaskService {
  private apiUrl = `${environment.apiUrl}/api/EmailTask`;

  constructor(private http: HttpClient) { }

  // Get all tasks by status
  getTasks(status: string): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/status/${status}`);
  }

  // Get task by ID
  getTaskById(taskId: number): Observable<EmailTask> {
    return this.http.get<EmailTask>(`${this.apiUrl}/${taskId}`);
  }

  // Get tasks assigned to specific user
  getTasksByUser(userId: number): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/user/${userId}`);
  }

  // Get tasks by category
  getTasksByCategory(category: string): Observable<EmailTask[]> {
    return this.http.get<EmailTask[]>(`${this.apiUrl}/category/${category}`);
  }

  // Assign task to user
  assignTask(taskId: number, userId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${taskId}/assign`, { assignedToUserId: userId });
  }

  // Update task status
  updateTaskStatus(taskId: number, status: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${taskId}/status`, { status: status });
  }

  // Create task manually
  createTask(task: any): Observable<EmailTask> {
    return this.http.post<EmailTask>(this.apiUrl, task);
  }

  // Delete task
  deleteTask(taskId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${taskId}`);
  }

  // Get current logged-in user
  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/api/Auth/me`);
  }

  // Get all users for assignment dropdown
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${environment.apiUrl}/api/Auth/users`);
  }

  // Get statistics
  getStatistics(): Observable<TaskStatistics> {
    return this.http.get<TaskStatistics>(`${this.apiUrl}/statistics`);
  }

  // Get user statistics
  getUserStatistics(userId: number): Observable<TaskStatistics> {
    return this.http.get<TaskStatistics>(`${this.apiUrl}/statistics/user/${userId}`);
  }

  // Execute action on task
  executeAction(taskId: number, action: string, data?: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${taskId}/action/${action}`, data);
  }

  // Add comment to task
  addComment(taskId: number, comment: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${taskId}/comments`, { commentText: comment });
  }

  // Get task history
  getTaskHistory(taskId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${taskId}/history`);
  }
}