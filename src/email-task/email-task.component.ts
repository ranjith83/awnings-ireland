import { Component, OnInit } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { EmailTaskService } from '../service/email-task.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface EmailTask {
  taskId: number;
  incomingEmailId: number;
  fromName: string;
  fromEmail: string;
  subject: string;
  category: string;
  dateAdded: Date;
  status: string; // 'Pending', 'Processed', 'Junk'
  assignedTo: string | null;
  assignedToUserId: number | null;
  companyNumber: string | null;
  emailBody: string;
  hasAttachments: boolean;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  attachmentId: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  blobUrl: string;
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

@Component({
  selector: 'app-email-tasks',
  templateUrl: './email-task.component.html',
  imports: [FormsModule,  CommonModule],
  styleUrls: ['./email-task.component.css']
})
export class EmailTaskComponent implements OnInit {
  // Tab Management
  activeTab: 'tasks' | 'processed' | 'junk' = 'tasks';

  // Task Lists
  tasks$: Observable<EmailTask[]>;
  processedTasks$: Observable<EmailTask[]>;
  junkTasks$: Observable<EmailTask[]>;
  
  private tasksSubject = new BehaviorSubject<EmailTask[]>([]);
  private processedSubject = new BehaviorSubject<EmailTask[]>([]);
  private junkSubject = new BehaviorSubject<EmailTask[]>([]);

  // Current View
  selectedTask: EmailTask | null = null;
  showEmailViewer: boolean = false;
  activeEmailTab: 'email' | 'attachments' = 'email';

  // Available Users for Assignment
  users: User[] = [];

  // Actions List
  availableActions = [
    { value: 'add_company', label: 'Add Company' },
    { value: 'generate_quote', label: 'Generate Quote' },
    { value: 'generate_invoice', label: 'Generate Invoice' },
    { value: 'add_site_visit', label: 'Add Site Visit' },
    { value: 'move_to_junk', label: 'Move to Junk' }
  ];

  // Form Models
  selectedAssignee: number | null = null;
  selectedAction: string = '';

  // Current User (logged in user)
  currentUser: User | null = null;

  constructor(private emailTaskService: EmailTaskService) {
    this.tasks$ = this.tasksSubject.asObservable();
    this.processedTasks$ = this.processedSubject.asObservable();
    this.junkTasks$ = this.junkSubject.asObservable();
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadUsers();
    this.loadAllTasks();
  }

  loadCurrentUser(): void {
    // Get current logged-in user
    this.emailTaskService.getCurrentUser().subscribe(user => {
      this.currentUser = user;
    });
  }

  loadUsers(): void {
    this.emailTaskService.getUsers().subscribe(users => {
      this.users = users;
    });
  }

  loadAllTasks(): void {
    // Load tasks for current tab
    this.emailTaskService.getTasks('Pending').subscribe(tasks => {
      this.tasksSubject.next(tasks);
    });

    this.emailTaskService.getTasks('Processed').subscribe(tasks => {
      this.processedSubject.next(tasks);
    });

    this.emailTaskService.getTasks('Junk').subscribe(tasks => {
      this.junkSubject.next(tasks);
    });
  }

  // Load tasks assigned to current user
  loadMyTasks(): void {
    if (this.currentUser) {
      this.emailTaskService.getTasksByUser(this.currentUser.userId).subscribe(tasks => {
        this.tasksSubject.next(tasks.filter(t => t.status === 'Pending'));
        this.processedSubject.next(tasks.filter(t => t.status === 'Processed'));
      });
    }
  }

  // Tab Switching
  setActiveTab(tab: 'tasks' | 'processed' | 'junk'): void {
    this.activeTab = tab;
    this.closeEmailViewer();
  }

  // View Email (Double-click or Context Menu)
  viewEmail(task: EmailTask): void {
    this.selectedTask = task;
    this.showEmailViewer = true;
    this.activeEmailTab = 'email';
    
    // Pre-select current assignee
    this.selectedAssignee = task.assignedToUserId;
    this.selectedAction = '';

    // Load full email details if needed
    this.emailTaskService.getTaskById(task.taskId).subscribe(fullTask => {
      this.selectedTask = fullTask;
    });
  }

  closeEmailViewer(): void {
    this.showEmailViewer = false;
    this.selectedTask = null;
    this.selectedAssignee = null;
    this.selectedAction = '';
  }

  // Email Viewer Tab Switching
  setEmailTab(tab: 'email' | 'attachments'): void {
    this.activeEmailTab = tab;
  }

  // Assignment
  assignTask(): void {
    if (!this.selectedTask || !this.selectedAssignee) return;

    this.emailTaskService.assignTask(this.selectedTask.taskId, this.selectedAssignee).subscribe({
      next: () => {
        alert('Task assigned successfully');
        this.loadAllTasks();
        // Keep viewer open after assignment
      },
      error: (err) => {
        alert('Error assigning task: ' + err.message);
      }
    });
  }

  // Execute Action
  executeAction(): void {
    if (!this.selectedTask || !this.selectedAction) return;

    switch (this.selectedAction) {
      case 'add_company':
        this.addCompany();
        break;
      case 'generate_quote':
        this.generateQuote();
        break;
      case 'generate_invoice':
        this.generateInvoice();
        break;
      case 'add_site_visit':
        this.addSiteVisit();
        break;
      case 'move_to_junk':
        this.moveToJunk();
        break;
    }
  }

  addCompany(): void {
    // Navigate to add company page or open modal
    console.log('Add company for email:', this.selectedTask);
    // TODO: Implement company creation with pre-filled data
    // After completion, mark task as processed
    this.markAsProcessed();
  }

  generateQuote(): void {
    // Navigate to quote generation page with pre-filled data
    console.log('Generate quote for email:', this.selectedTask);
    // TODO: Open quote component with extracted data
    this.markAsProcessed();
  }

  generateInvoice(): void {
    // Navigate to invoice generation page with pre-filled data
    console.log('Generate invoice for email:', this.selectedTask);
    // TODO: Open invoice component with extracted data
    this.markAsProcessed();
  }

  addSiteVisit(): void {
    // Navigate to site visit scheduling
    console.log('Add site visit for email:', this.selectedTask);
    // TODO: Open site visit component
    this.markAsProcessed();
  }

  moveToJunk(): void {
    if (!this.selectedTask) return;

    if (confirm('Move this email to Junk?')) {
      this.emailTaskService.updateTaskStatus(this.selectedTask.taskId, 'Junk').subscribe({
        next: () => {
          this.closeEmailViewer();
          this.loadAllTasks();
        },
        error: (err) => {
          alert('Error moving to junk: ' + err.message);
        }
      });
    }
  }

  markAsProcessed(): void {
    if (!this.selectedTask) return;

    this.emailTaskService.updateTaskStatus(this.selectedTask.taskId, 'Processed').subscribe({
      next: () => {
        this.closeEmailViewer();
        this.loadAllTasks();
      },
      error: (err) => {
        alert('Error marking as processed: ' + err.message);
      }
    });
  }

  // Save (Assign + Execute Action)
  save(): void {
    // First assign if needed
    if (this.selectedAssignee && this.selectedTask?.assignedToUserId !== this.selectedAssignee) {
      this.assignTask();
    }

    // Then execute action if selected
    if (this.selectedAction) {
      this.executeAction();
    } else {
      // Just close if no action
      this.closeEmailViewer();
    }
  }

  // New Task Button
  createNewTask(): void {
    // TODO: Open modal to manually create a task
    console.log('Create new task manually');
  }

  // Download Attachment
  downloadAttachment(attachment: EmailAttachment): void {
    window.open(attachment.blobUrl, '_blank');
  }

  // Context Menu (Right-click)
  onContextMenu(event: MouseEvent, task: EmailTask): void {
    event.preventDefault();
    this.viewEmail(task);
  }

  // Double-click
  onRowDoubleClick(task: EmailTask): void {
    this.viewEmail(task);
  }

  // Keyboard Shortcut (CTRL+V)
  onKeyDown(event: KeyboardEvent, task: EmailTask): void {
    if (event.ctrlKey && event.key === 'v') {
      event.preventDefault();
      this.viewEmail(task);
    }
  }

  // Get category display name
  getCategoryDisplay(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'invoice_creation': 'New Invoice',
      'quote_creation': 'New Quote',
      'customer_creation': 'New Customer',
      'showroom_booking': 'Site Visit',
      'product_inquiry': 'Inquiry',
      'complaint': 'Complaint',
      'general_inquiry': 'Inquiry',
      'payment': 'Payment'
    };
    return categoryMap[category] || category;
  }

  // Format date for display
  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}