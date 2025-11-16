import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { 
  Task, 
  CreateTaskDto, 
  UpdateTaskDto, 
  TaskFilterDto, 
  TaskComment, 
  TaskAttachment, 
  TaskAudit,
  TaskStatistics, 
  TaskStatus,
  AuditAction,
  TaskPriority,
  TaskService
} from '../service/task.service';

@Component({
  selector: 'app-task.component',
   imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './task.component.html',
  styleUrl: './task.component.css'
})
export class TaskComponent implements OnInit  {

 tasks: Task[] = [];
  filteredTasks: Task[] = [];
  
  isLoading = false;
  errorMessage = '';
  
  // Current user (should come from auth service)
  currentUserId = 1;
  
  // Filter options
  filterForm: FormGroup;
  showFilters = false;
  
  // Tab selection
  activeTab: 'all' | 'my-tasks' | 'created-by-me' | 'overdue' = 'all';
  
  // Enums for template
  TaskStatus = TaskStatus;
  TaskPriority = TaskPriority;
  
  // Search
  searchText = '';

  constructor(
    private taskService: TaskService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      status: [[]],
      priority: [[]],
      assignedTo: [[]],
      dueDateFrom: [''],
      dueDateTo: [''],
      searchText: ['']
    });
  }

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    let request;
    
    switch (this.activeTab) {
      case 'my-tasks':
        request = this.taskService.getMyTasks(this.currentUserId);
        break;
      case 'created-by-me':
        request = this.taskService.getTasksCreatedByMe(this.currentUserId);
        break;
      case 'overdue':
        request = this.taskService.getOverdueTasks();
        break;
      default:
        request = this.taskService.getAllTasks();
    }
    
    request.subscribe({
      next: (data) => {
        this.tasks = data;
        this.filteredTasks = [...this.tasks];
        this.applyFilters();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading tasks:', error);
        this.errorMessage = 'Failed to load tasks. Please try again.';
        this.isLoading = false;
      }
    });
  }

  setActiveTab(tab: 'all' | 'my-tasks' | 'created-by-me' | 'overdue'): void {
    this.activeTab = tab;
    this.loadTasks();
  }

  applyFilters(): void {
    const filters = this.filterForm.value;
    
    this.filteredTasks = this.tasks.filter(task => {
      // Status filter
      if (filters.status?.length && !filters.status.includes(task.status)) {
        return false;
      }
      
      // Priority filter
      if (filters.priority?.length && !filters.priority.includes(task.priority)) {
        return false;
      }
      
      // Search text
      if (this.searchText) {
        const searchLower = this.searchText.toLowerCase();
        const matchesSearch = 
          task.title.toLowerCase().includes(searchLower) ||
          task.description.toLowerCase().includes(searchLower) ||
          task.assignedToName.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }
      
      return true;
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  clearFilters(): void {
    this.filterForm.reset({
      status: [],
      priority: [],
      assignedTo: [],
      dueDateFrom: '',
      dueDateTo: '',
      searchText: ''
    });
    this.searchText = '';
    this.applyFilters();
  }

  openCreateTaskModal(): void {
    this.router.navigate(['/tasks/create']);
  }

  viewTaskDetails(task: Task): void {
    this.router.navigate(['/tasks', task.taskId]);
  }

  updateTaskStatus(task: Task, newStatus: TaskStatus): void {
    this.taskService.updateTaskStatus(task.taskId, newStatus).subscribe({
      next: () => {
        task.status = newStatus;
        alert('Task status updated successfully');
      },
      error: (error) => {
        console.error('Error updating task status:', error);
        alert('Failed to update task status');
      }
    });
  }

  deleteTask(task: Task, event: Event): void {
    event.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete the task "${task.title}"?`)) {
      return;
    }
    
    this.taskService.deleteTask(task.taskId).subscribe({
      next: () => {
        alert('Task deleted successfully');
        this.loadTasks();
      },
      error: (error) => {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
      }
    });
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

  isOverdue(task: Task): boolean {
    if (!task.dueDate || task.status === TaskStatus.COMPLETED) {
      return false;
    }
    return new Date(task.dueDate) < new Date();
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}