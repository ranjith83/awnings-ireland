import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskService
} from '../service/task.service';
import { NotificationService } from '../service/notification.service';
import { NavService } from '../service/nav.service';

interface TaskDisplay extends Task {
  overdueState: boolean;
  formattedDueDate: string;
  statusCssClass: string;
  priorityCssClass: string;
}

@Component({
  selector: 'app-task.component',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './task.component.html',
  styleUrl: './task.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskComponent implements OnInit, OnDestroy {
  tasks: Task[] = [];
  filteredTasks: TaskDisplay[] = [];

  isLoading = false;
  errorMessage = '';

  currentUserId = 1;

  filterForm: FormGroup;
  showFilters = false;

  activeTab: 'all' | 'my-tasks' | 'created-by-me' | 'overdue' = 'all';

  TaskStatus = TaskStatus;
  TaskPriority = TaskPriority;

  searchText = '';

  private destroy$     = new Subject<void>();
  private searchSubject = new Subject<string>();

  trackByTaskId = (_: number, task: Task)  => task.taskId;
  trackByValue  = (_: number, v: any)      => v;

  constructor(
    private taskService: TaskService,
    private fb: FormBuilder,
    private notificationService: NotificationService,
    private nav: NavService,
    private cdr: ChangeDetectorRef
  ) {
    this.filterForm = this.fb.group({
      status:      [[]],
      priority:    [[]],
      assignedTo:  [[]],
      dueDateFrom: [''],
      dueDateTo:   [''],
      searchText:  ['']
    });
  }

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
      this.cdr.markForCheck();
    });

    this.loadTasks();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTasks(): void {
    this.isLoading = true;
    this.errorMessage = '';

    let request;
    switch (this.activeTab) {
      case 'my-tasks':       request = this.taskService.getMyTasks(this.currentUserId); break;
      case 'created-by-me':  request = this.taskService.getTasksCreatedByMe(this.currentUserId); break;
      case 'overdue':        request = this.taskService.getOverdueTasks(); break;
      default:               request = this.taskService.getAllTasks();
    }

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.tasks = data;
        this.applyFilters();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'Failed to load tasks. Please try again.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  setActiveTab(tab: 'all' | 'my-tasks' | 'created-by-me' | 'overdue'): void {
    this.activeTab = tab;
    this.loadTasks();
  }

  applyFilters(): void {
    const filters = this.filterForm.value;
    const now = new Date();

    this.filteredTasks = this.tasks
      .filter(task => {
        if (filters.status?.length   && !filters.status.includes(task.status))     return false;
        if (filters.priority?.length && !filters.priority.includes(task.priority)) return false;
        if (this.searchText) {
          const q = this.searchText.toLowerCase();
          if (!task.title.toLowerCase().includes(q) &&
              !task.description.toLowerCase().includes(q) &&
              !task.assignedToName.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .map(task => {
        const overdueState = !!(task.dueDate && task.status !== TaskStatus.COMPLETED && new Date(task.dueDate) < now);
        return {
          ...task,
          overdueState,
          formattedDueDate: task.dueDate
            ? new Date(task.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'N/A',
          statusCssClass:   this.getStatusClass(task.status),
          priorityCssClass: this.getPriorityClass(task.priority),
        } as TaskDisplay;
      });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchText);
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  clearFilters(): void {
    this.filterForm.reset({ status: [], priority: [], assignedTo: [], dueDateFrom: '', dueDateTo: '', searchText: '' });
    this.searchText = '';
    this.applyFilters();
    this.cdr.markForCheck();
  }

  openCreateTaskModal(): void {
    this.nav.go(['/tasks/create']);
  }

  viewTaskDetails(task: Task): void {
    this.nav.go(['/tasks', task.taskId]);
  }

  updateTaskStatus(task: Task, newStatus: TaskStatus): void {
    this.taskService.updateTaskStatus(task.taskId, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          task.status = newStatus;
          this.applyFilters();
          this.cdr.markForCheck();
        },
        error: () => this.notificationService.error('Failed to update task status')
      });
  }

  deleteTask(task: Task, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to delete the task "${task.title}"?`)) return;

    this.taskService.deleteTask(task.taskId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  () => this.loadTasks(),
        error: () => this.notificationService.error('Failed to delete task')
      });
  }

  getStatusClass(status: TaskStatus): string {
    const map: Record<TaskStatus, string> = {
      [TaskStatus.TODO]:         'status-todo',
      [TaskStatus.IN_PROGRESS]:  'status-in-progress',
      [TaskStatus.UNDER_REVIEW]: 'status-under-review',
      [TaskStatus.COMPLETED]:    'status-completed',
      [TaskStatus.CANCELLED]:    'status-cancelled',
      [TaskStatus.ON_HOLD]:      'status-on-hold'
    };
    return map[status] || '';
  }

  getPriorityClass(priority: TaskPriority): string {
    const map: Record<TaskPriority, string> = {
      [TaskPriority.LOW]:    'priority-low',
      [TaskPriority.MEDIUM]: 'priority-medium',
      [TaskPriority.HIGH]:   'priority-high',
      [TaskPriority.URGENT]: 'priority-urgent'
    };
    return map[priority] || '';
  }
}
