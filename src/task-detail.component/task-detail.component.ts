// task-detail.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TaskService } from '../service/task.service';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskComment,
  TaskAttachment,
  TaskAudit,
  AuditAction
} from '../service/task.service';

import { NotificationService } from '../service/notification.service';
@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-detail.component.html',
  styleUrls: ['./task-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  task: Task | null = null;
  auditTrail: TaskAudit[] = [];
  comments: TaskComment[] = [];
  attachments: TaskAttachment[] = [];
  
  isLoading = false;
  errorMessage = '';
  
  // Current user
  currentUserId = 1;
  
  // Active tab
  activeTab: 'details' | 'comments' | 'attachments' | 'audit' = 'details';
  
  // New comment
  newCommentText = '';
  isAddingComment = false;
  
  // File upload
  selectedFile: File | null = null;
  isUploadingFile = false;
  
  // Enums for template
  TaskStatus = TaskStatus;
  TaskPriority = TaskPriority;
  AuditAction = AuditAction;

  constructor(
    private taskService: TaskService,
    private route: ActivatedRoute,
    private router: Router,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const taskId = Number(this.route.snapshot.paramMap.get('id'));
    if (taskId) {
      this.loadTask(taskId);
      this.loadAuditTrail(taskId);
      this.loadComments(taskId);
      this.loadAttachments(taskId);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTask(taskId: number): void {
    this.isLoading = true;
    this.taskService.getTaskById(taskId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.task = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'Failed to load task details';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadAuditTrail(taskId: number): void {
    this.taskService.getAuditTrail(taskId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.auditTrail = data;
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  loadComments(taskId: number): void {
    this.taskService.getComments(taskId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.comments = data;
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  loadAttachments(taskId: number): void {
    this.taskService.getAttachments(taskId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.attachments = data;
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  setActiveTab(tab: 'details' | 'comments' | 'attachments' | 'audit'): void {
    this.activeTab = tab;
  }

  updateTaskStatus(status: TaskStatus): void {
    if (!this.task) return;

    this.taskService.updateTaskStatus(this.task.taskId, status).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updatedTask) => {
        this.task = updatedTask;
        this.loadAuditTrail(this.task.taskId);
        this.notificationService.success('Task status updated successfully');
        this.cdr.markForCheck();
      },
      error: () => this.notificationService.error('Failed to update task status')
    });
  }

  addComment(): void {
    if (!this.task || !this.newCommentText.trim()) return;

    this.isAddingComment = true;
    this.taskService.addComment(this.task.taskId, this.newCommentText).pipe(takeUntil(this.destroy$)).subscribe({
      next: (comment) => {
        this.comments.unshift(comment);
        this.newCommentText = '';
        this.isAddingComment = false;
        this.loadAuditTrail(this.task!.taskId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationService.error('Failed to add comment');
        this.isAddingComment = false;
        this.cdr.markForCheck();
      }
    });
  }

  deleteComment(comment: TaskComment): void {
    if (!this.task || !confirm('Are you sure you want to delete this comment?')) return;

    this.taskService.deleteComment(this.task.taskId, comment.commentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.comments = this.comments.filter(c => c.commentId !== comment.commentId);
        this.loadAuditTrail(this.task!.taskId);
        this.cdr.markForCheck();
      },
      error: () => this.notificationService.error('Failed to delete comment')
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.uploadFile();
    }
  }

  uploadFile(): void {
    if (!this.task || !this.selectedFile) return;

    this.isUploadingFile = true;
    this.taskService.uploadAttachment(this.task.taskId, this.selectedFile).pipe(takeUntil(this.destroy$)).subscribe({
      next: (attachment) => {
        this.attachments.push(attachment);
        this.selectedFile = null;
        this.isUploadingFile = false;
        this.loadAuditTrail(this.task!.taskId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.notificationService.error('Failed to upload file');
        this.isUploadingFile = false;
        this.cdr.markForCheck();
      }
    });
  }

  deleteAttachment(attachment: TaskAttachment): void {
    if (!this.task || !confirm('Are you sure you want to delete this attachment?')) return;

    this.taskService.deleteAttachment(this.task.taskId, attachment.attachmentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.attachments = this.attachments.filter(a => a.attachmentId !== attachment.attachmentId);
        this.loadAuditTrail(this.task!.taskId);
        this.cdr.markForCheck();
      },
      error: () => this.notificationService.error('Failed to delete attachment')
    });
  }

  goBack(): void {
    this.router.navigate(['/tasks']);
  }

  getStatusClass(status: TaskStatus): string {
    const statusClasses = {
      [TaskStatus.TODO]: 'status-todo',
      [TaskStatus.IN_PROGRESS]: 'status-in-progress',
      [TaskStatus.UNDER_REVIEW]: 'status-under-review',
      [TaskStatus.COMPLETED]: 'status-completed',
      [TaskStatus.CANCELLED]: 'status-cancelled',
      [TaskStatus.ON_HOLD]: 'status-on-hold'
    };
    return statusClasses[status] || '';
  }

  getPriorityClass(priority: TaskPriority): string {
    const priorityClasses = {
      [TaskPriority.LOW]: 'priority-low',
      [TaskPriority.MEDIUM]: 'priority-medium',
      [TaskPriority.HIGH]: 'priority-high',
      [TaskPriority.URGENT]: 'priority-urgent'
    };
    return priorityClasses[priority] || '';
  }

  getAuditActionIcon(action: AuditAction): string {
    const icons = {
      [AuditAction.CREATED]: '✨',
      [AuditAction.ASSIGNED]: '👤',
      [AuditAction.REASSIGNED]: '🔄',
      [AuditAction.STATUS_CHANGED]: '📊',
      [AuditAction.PRIORITY_CHANGED]: '🔔',
      [AuditAction.DESCRIPTION_UPDATED]: '📝',
      [AuditAction.DUE_DATE_CHANGED]: '📅',
      [AuditAction.COMMENT_ADDED]: '💬',
      [AuditAction.ATTACHMENT_ADDED]: '📎',
      [AuditAction.ATTACHMENT_REMOVED]: '🗑️',
      [AuditAction.COMPLETED]: '✅',
      [AuditAction.CANCELLED]: '❌',
      [AuditAction.REOPENED]: '🔓'
    };
    return icons[action] || '📌';
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateTime(date: Date): string {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}