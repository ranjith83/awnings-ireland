
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { delay, Observable, of } from 'rxjs';
import { FormGroup } from '@angular/forms';

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  UNDER_REVIEW = 'UNDER_REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ON_HOLD = 'ON_HOLD'
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum AuditAction {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  REASSIGNED = 'REASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  DESCRIPTION_UPDATED = 'DESCRIPTION_UPDATED',
  DUE_DATE_CHANGED = 'DUE_DATE_CHANGED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED = 'ATTACHMENT_REMOVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REOPENED = 'REOPENED'
}

export interface User {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department?: string;
}

export interface TaskAttachment {
  attachmentId: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  uploadedBy: number;
  uploadedByName: string;
  uploadedAt: Date;
}

export interface TaskComment {
  commentId: number;
  taskId: number;
  commentText: string;
  createdBy: number;
  createdByName: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TaskAudit {
  auditId: number;
  taskId: number;
  action: AuditAction;
  performedBy: number;
  performedByName: string;
  performedAt: Date;
  oldValue?: string;
  newValue?: string;
  description: string;
  ipAddress?: string;
}

export interface Task {
  taskId: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  
  // Assignment details
  createdBy: number;
  createdByName: string;
  assignedTo: number;
  assignedToName: string;
  
  // Dates
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  completedAt?: Date;
  
  // Additional fields
  category?: string;
  tags?: string[];
  estimatedHours?: number;
  actualHours?: number;
  
  // Relations
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  auditTrail?: TaskAudit[];
}

export interface CreateTaskDto {
  title: string;
  description: string;
  priority: TaskPriority;
  assignedTo: number;
  dueDate?: Date;
  category?: string;
  tags?: string[];
  estimatedHours?: number;
}

export interface UpdateTaskDto {
  taskId: number;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: number;
  dueDate?: Date;
  category?: string;
  tags?: string[];
  estimatedHours?: number;
  actualHours?: number;
}

export interface TaskFilterDto {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  assignedTo?: number[];
  createdBy?: number[];
  dueDateFrom?: Date;
  dueDateTo?: Date;
  searchText?: string;
  category?: string[];
  tags?: string[];
}

export interface TaskStatistics {
  totalTasks: number;
  todoTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  tasksByPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  tasksByStatus: {
    todo: number;
    inProgress: number;
    underReview: number;
    completed: number;
    cancelled: number;
    onHold: number;
  };
}


@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private apiUrl = '/api/tasks'; // Update with your API base URL

  constructor(private http: HttpClient) {}

  // Task CRUD Operations
  getAllTasks(filters?: TaskFilterDto): Observable<Task[]> {
    let params = new HttpParams();
     const mockTasks: Task[] = 
     [
  {
    taskId: 1,
    title: 'Implement User Authentication',
    description: 'Develop login, registration, and JWT-based authentication module.',
    status: TaskStatus.CANCELLED,
    priority: TaskPriority.HIGH,
    createdBy: 101,
    createdByName: 'Alice Johnson',
    assignedTo: 102,
    assignedToName: 'Bob Smith',
    createdAt: new Date('2025-11-01T10:00:00'),
    updatedAt: new Date('2025-11-10T15:30:00'),
    dueDate: new Date('2025-11-20T23:59:59'),
    category: 'Backend',
    tags: ['auth', 'security', 'api'],
    estimatedHours: 16,
    actualHours: 10,
    comments: [
      {
        commentId: 1,
        taskId: 1,
        commentText: 'Started implementing the login endpoint.',
        createdBy: 102,
        createdByName: 'Bob Smith',
        createdAt: new Date('2025-11-02T09:00:00'),
      },
      {
        commentId: 2,
        taskId: 1,
        commentText: 'Need clarification on password reset flow.',
        createdBy: 102,
        createdByName: 'Bob Smith',
        createdAt: new Date('2025-11-03T11:30:00'),
      },
    ],
    attachments: [
      {
        attachmentId: 1,
        fileName: 'auth-diagram.png',
        fileSize: 204800,
        fileType: 'image/png',
        fileUrl: 'https://dummyurl.com/files/auth-diagram.png',
        uploadedBy: 102,
        uploadedByName: 'Bob Smith',
        uploadedAt: new Date('2025-11-02T09:30:00'),
      },
    ],
    auditTrail: [
      {
        auditId: 1,
        taskId: 1,
        action: AuditAction.CREATED,
        performedBy: 101,
        performedByName: 'Alice Johnson',
        performedAt: new Date('2025-11-01T10:00:00'),
        description: 'Task created',
      },
      {
        auditId: 2,
        taskId: 1,
        action: AuditAction.ASSIGNED,
        performedBy: 102,
        performedByName: 'Bob Smith',
        performedAt: new Date('2025-11-05T14:00:00'),
        oldValue: '{"status": "ToDo"}',
        newValue: '{"status": "InProgress"}',
        description: 'Status updated to InProgress',
      },
    ],
  },
 
];
     return of(mockTasks); // simulate API delay
/**

    if (filters) {
      if (filters.status?.length) {
        params = params.append('status', filters.status.join(','));
      }
      if (filters.priority?.length) {
        params = params.append('priority', filters.priority.join(','));
      }
      if (filters.assignedTo?.length) {
        params = params.append('assignedTo', filters.assignedTo.join(','));
      }
      if (filters.searchText) {
        params = params.append('search', filters.searchText);
      }
      // Add more filter parameters as needed
    }
    
    return this.http.get<Task[]>(this.apiUrl, { params });
     */
  }

  getTaskById(taskId: number): Observable<Task> {

    const dummyTask: Task = {
    taskId: 1,
    title: 'Implement User Authentication',
    description: 'Develop login, registration, and JWT-based authentication module.',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.HIGH,
    createdBy: 101,
    createdByName: 'Alice Johnson',
    assignedTo: 102,
    assignedToName: 'Bob Smith',
    createdAt: new Date('2025-11-01T10:00:00'),
    updatedAt: new Date('2025-11-10T15:30:00'),
    dueDate: new Date('2025-11-20T23:59:59'),
    category: 'Backend',
    tags: ['auth', 'security', 'api'],
    estimatedHours: 16,
    actualHours: 10,
    comments: [],
    attachments: [],
    auditTrail: [],
  };

  return of(dummyTask);

    return this.http.get<Task>(`${this.apiUrl}/${taskId}`);
  }

  createTask(taskData: CreateTaskDto): Observable<Task> {
    return this.http.post<Task>(this.apiUrl, taskData);
  }

  updateTask(taskData: UpdateTaskDto): Observable<Task> {
    return this.http.put<Task>(`${this.apiUrl}/${taskData.taskId}`, taskData);
  }

  deleteTask(taskId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${taskId}`);
  }

  // Task Assignment
  assignTask(taskId: number, userId: number): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/${taskId}/assign`, { userId });
  }

  reassignTask(taskId: number, fromUserId: number, toUserId: number): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/${taskId}/reassign`, { fromUserId, toUserId });
  }

  // Task Status Management
  updateTaskStatus(taskId: number, status: string): Observable<Task> {
    return this.http.patch<Task>(`${this.apiUrl}/${taskId}/status`, { status });
  }

  completeTask(taskId: number, actualHours?: number): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/${taskId}/complete`, { actualHours });
  }

  cancelTask(taskId: number, reason: string): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/${taskId}/cancel`, { reason });
  }

  reopenTask(taskId: number): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/${taskId}/reopen`, {});
  }

  // Comments
  addComment(taskId: number, commentText: string): Observable<TaskComment> {
    return this.http.post<TaskComment>(`${this.apiUrl}/${taskId}/comments`, { commentText });
  }

  getComments(taskId: number): Observable<TaskComment[]> {
    return this.http.get<TaskComment[]>(`${this.apiUrl}/${taskId}/comments`);
  }

  updateComment(taskId: number, commentId: number, commentText: string): Observable<TaskComment> {
    return this.http.put<TaskComment>(`${this.apiUrl}/${taskId}/comments/${commentId}`, { commentText });
  }

  deleteComment(taskId: number, commentId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${taskId}/comments/${commentId}`);
  }

  // Attachments
  uploadAttachment(taskId: number, file: File): Observable<TaskAttachment> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<TaskAttachment>(`${this.apiUrl}/${taskId}/attachments`, formData);
  }

  getAttachments(taskId: number): Observable<TaskAttachment[]> {
    return this.http.get<TaskAttachment[]>(`${this.apiUrl}/${taskId}/attachments`);
  }

  deleteAttachment(taskId: number, attachmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${taskId}/attachments/${attachmentId}`);
  }

  // Audit Trail
  getAuditTrail(taskId: number): Observable<TaskAudit[]> {
    return this.http.get<TaskAudit[]>(`${this.apiUrl}/${taskId}/audit`);
  }

  // Statistics and Reports
  getTaskStatistics(userId?: number): Observable<TaskStatistics> {
    const params = userId ? new HttpParams().set('userId', userId.toString()) : undefined;
    return this.http.get<TaskStatistics>(`${this.apiUrl}/statistics`, { params });
  }

  getMyTasks(userId: number): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}/my-tasks/${userId}`);
  }

  getTasksCreatedByMe(userId: number): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}/created-by-me/${userId}`);
  }

  getOverdueTasks(): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}/overdue`);
  }

  // Search and Filter
  searchTasks(searchText: string): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}/search`, {
      params: new HttpParams().set('q', searchText)
    });
  }
}