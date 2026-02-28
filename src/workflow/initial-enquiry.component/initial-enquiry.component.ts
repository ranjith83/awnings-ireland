import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { WorkflowService, InitialEnquiryDto } from '../../service/workflow.service';
import { EmailTaskService, EmailTask, SendTaskEmailPayload, SendDirectEmailPayload } from '../../service/email-task.service';

export interface CustomerEmailRow {
  taskId: number;
  subject: string;
  fromEmail: string;
  fromName: string;
  dateAdded: Date;
  status: string;
  taskType: string;
  priority: string;
  emailBody: string;
  category: string;
}

@Component({
  selector: 'app-initial-enquiry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './initial-enquiry.component.html',
  styleUrl: './initial-enquiry.component.css'
})
export class InitialEnquiryComponent implements OnInit, OnDestroy {

  // ── Route context ──────────────────────────────────────────────────────────
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName  = '';
  customerEmail = '';

  /** Set when navigated from Follow-Up screen — shows a contextual banner. */
  fromFollowUp: number | null = null;
  /** Set when navigated from Task screen — shows a contextual banner. */
  fromTask: number | null = null;

  // ── State subjects ─────────────────────────────────────────────────────────
  isLoadingEnquiries$ = new BehaviorSubject<boolean>(false);
  isLoadingEmails$    = new BehaviorSubject<boolean>(false);
  isSaving$           = new BehaviorSubject<boolean>(false);
  isSendingEmail$     = new BehaviorSubject<boolean>(false);
  successMessage$     = new BehaviorSubject<string>('');
  errorMessage$       = new BehaviorSubject<string>('');

  // ── Data ───────────────────────────────────────────────────────────────────
  enquiries: InitialEnquiryDto[] = [];
  customerEmails: CustomerEmailRow[] = [];

  // ── Add form  (email FIRST, then comments) ─────────────────────────────────
  newEmail       = '';
  newComments    = '';
  sendEmailOnAdd = true;

  // ── Edit modal  (email FIRST, then comments) ───────────────────────────────
  showEditModal      = false;
  editingEnquiry: InitialEnquiryDto | null = null;
  editEmail          = '';
  editComments       = '';
  sendEmailOnUpdate  = true;   // ← NEW: send email when saving an update

  // ── Email preview modal ────────────────────────────────────────────────────
  showEmailModal   = false;
  emailModalTask: CustomerEmailRow | null = null;

  // ── Send-email modal ───────────────────────────────────────────────────────
  showSendModal    = false;
  sendModalTaskId: number | null = null;
  sendSubject      = '';
  sendBody         = '';
  sendToEmail      = '';

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private workflowService: WorkflowService,
    private emailTaskService: EmailTaskService
  ) {}

  ngOnInit() {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.workflowId    = params['workflowId']    ? +params['workflowId']    : null;
        this.customerId    = params['customerId']    ? +params['customerId']    : null;
        this.customerName  = params['customerName']  ?? '';
        this.customerEmail = params['customerEmail'] ?? '';
        this.fromFollowUp  = params['fromFollowUp']  ? +params['fromFollowUp']  : null;
        this.fromTask      = params['fromTask']      ? +params['fromTask']      : null;
        this.newEmail      = this.customerEmail;
        this.loadAll();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  loadAll() {
    if (this.workflowId) this.loadEnquiries(this.workflowId);
    if (this.customerId) this.loadCustomerEmails(this.customerId);
  }

  loadEnquiries(workflowId: number) {
    this.isLoadingEnquiries$.next(true);
    this.workflowService.getInitialEnquiryForWorkflow(workflowId)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingEnquiries$.next(false)))
      .subscribe({
        next: (data) => {
          this.enquiries = data;
          if (!this.newEmail && data.length) {
            const first = data.find(e => e.email);
            if (first) { this.newEmail = first.email; this.customerEmail = first.email; }
          }
        },
        error: () => this.showError('Failed to load initial enquiries.')
      });
  }

  loadCustomerEmails(customerId: number) {
    this.isLoadingEmails$.next(true);
    this.emailTaskService.getTasksByCustomer(customerId)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingEmails$.next(false)))
      .subscribe({
        next: (tasks: EmailTask[]) => {
          this.customerEmails = tasks.map(t => ({
            taskId:    t.taskId,
            subject:   t.subject,
            fromEmail: t.fromEmail,
            fromName:  t.fromName,
            dateAdded: new Date(t.dateAdded),
            status:    t.status,
            taskType:  t.taskType,
            priority:  t.priority,
            emailBody: t.emailBody,
            category:  t.category
          }));
          if (!this.newEmail && tasks.length) {
            const first = tasks.find(t => t.fromEmail);
            if (first) { this.newEmail = first.fromEmail; this.customerEmail = first.fromEmail; }
          }
        },
        error: () => this.showError('Failed to load customer emails.')
      });
  }

  // ── Add enquiry ────────────────────────────────────────────────────────────

  addEnquiry() {
    if (!this.workflowId) { this.showError('No workflow selected.'); return; }
    if (!this.newComments.trim()) { this.showError('Please enter enquiry comments.'); return; }

    const dto: InitialEnquiryDto = {
      workflowId: this.workflowId,
      email:      this.newEmail.trim(),
      comments:   this.newComments.trim(),
      images:     ''
    };

    // Capture before async — fields clear on success
    const emailToSend    = this.newEmail.trim();
    const commentsToSend = this.newComments.trim();
    const shouldSend     = this.sendEmailOnAdd;

    this.isSaving$.next(true);
    this.workflowService.addInitialEnquiry(dto)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSaving$.next(false)))
      .subscribe({
        next: (saved) => {
          this.enquiries = [saved, ...this.enquiries];
          this.newComments = '';
          this.showSuccess('Enquiry added successfully!');

          if (shouldSend && emailToSend) {
            this.dispatchDirectEmail(
              emailToSend,
              `Re: Initial Enquiry – ${this.customerName}`,
              `Thank you for your enquiry.\n\n${commentsToSend}\n\nKind regards`
            );
          }
        },
        error: () => this.showError('Failed to add enquiry.')
      });
  }

  // ── Edit enquiry modal ─────────────────────────────────────────────────────

  openEditModal(enquiry: InitialEnquiryDto) {
    this.editingEnquiry   = { ...enquiry };
    this.editEmail        = enquiry.email;          // email shown first
    this.editComments     = enquiry.comments;
    this.sendEmailOnUpdate = true;
    this.showEditModal    = true;
    this.errorMessage$.next('');
  }

  closeEditModal() {
    this.showEditModal  = false;
    this.editingEnquiry = null;
    this.editEmail      = '';
    this.editComments   = '';
  }

  saveEdit() {
    if (!this.editingEnquiry) return;
    if (!this.editComments.trim()) { this.showError('Comments are required.'); return; }

    const dto: InitialEnquiryDto = {
      ...this.editingEnquiry,
      email:    this.editEmail.trim(),
      comments: this.editComments.trim()
    };

    this.isSaving$.next(true);
    this.workflowService.updateInitialEnquiry(dto)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSaving$.next(false)))
      .subscribe({
        next: (updated) => {
          const idx = this.enquiries.findIndex(e => e.enquiryId === updated.enquiryId);
          if (idx !== -1) this.enquiries[idx] = updated;
          this.enquiries = [...this.enquiries];

          // ── Send email to customer on update ──────────────────────────────
          if (this.sendEmailOnUpdate && this.editEmail.trim()) {
            this.dispatchDirectEmail(
              this.editEmail.trim(),
              `Enquiry Update – ${this.customerName}`,
              `Your enquiry details have been updated.\n\n${this.editComments.trim()}\n\nKind regards`
            );
          }

          this.showSuccess('Enquiry updated successfully!');
          this.closeEditModal();
        },
        error: () => this.showError('Failed to update enquiry.')
      });
  }

  // ── Email preview ──────────────────────────────────────────────────────────

  openEmailPreview(row: CustomerEmailRow) { this.emailModalTask = row; this.showEmailModal = true; }
  closeEmailPreview()                     { this.showEmailModal = false; this.emailModalTask = null; }

  // ── Send-email modal ───────────────────────────────────────────────────────

  openSendModal(row: CustomerEmailRow) {
    this.sendModalTaskId = row.taskId;
    this.sendToEmail     = row.fromEmail;
    this.sendSubject     = `Re: ${row.subject}`;
    this.sendBody        = '';
    this.showSendModal   = true;
    this.errorMessage$.next('');
  }

  closeSendModal() {
    this.showSendModal = false;
    this.sendModalTaskId = null;
    this.sendSubject = this.sendBody = this.sendToEmail = '';
  }

  sendEmail() {
    if (!this.sendModalTaskId) return;
    if (!this.sendBody.trim()) { this.showError('Please enter an email body.'); return; }

    // Reply modal always has a real taskId — use the task-threaded send endpoint
    const payload: SendTaskEmailPayload = {
      toEmail:  this.sendToEmail,
      subject:  this.sendSubject,
      body:     this.sendBody
    };
    this.isSendingEmail$.next(true);
    this.emailTaskService.sendTaskEmail(this.sendModalTaskId, payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({
        next:  () => { this.showSuccess('Email sent successfully!'); this.closeSendModal(); },
        error: () => this.showError('Failed to send email.')
      });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Send a fresh outbound email with no task context required.
   * Used for automatic notifications when adding or updating enquiries.
   * Calls POST /api/EmailTask/send-direct — always a new email, never threaded.
   */
  private dispatchDirectEmail(
    toEmail: string,
    subject: string,
    body: string,
    onSuccess?: () => void
  ) {
    if (!toEmail?.trim()) { onSuccess?.(); return; }

    const payload: SendDirectEmailPayload = { toEmail, subject, body };
    this.isSendingEmail$.next(true);
    this.emailTaskService.sendDirectEmail(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({
        next:  () => onSuccess?.(),
        error: () => this.showError('Enquiry saved, but the email notification could not be sent.')
      });
  }

  private showSuccess(msg: string) { this.successMessage$.next(msg); setTimeout(() => this.successMessage$.next(''), 3500); }
  private showError(msg: string)   { this.errorMessage$.next(msg);   setTimeout(() => this.errorMessage$.next(''),   4000); }

  getPriorityClass(p: string): string {
    switch (p?.toUpperCase()) {
      case 'HIGH': return 'badge badge--high'; case 'URGENT': return 'badge badge--urgent';
      case 'LOW':  return 'badge badge--low';  default:       return 'badge badge--medium';
    }
  }
  getStatusClass(s: string): string {
    switch (s?.toUpperCase()) {
      case 'COMPLETED': return 'badge badge--completed'; case 'CANCELLED': return 'badge badge--cancelled';
      case 'PENDING':   return 'badge badge--pending';   default:          return 'badge badge--inprogress';
    }
  }

  trackByEnquiry(_: number, e: InitialEnquiryDto) { return e.enquiryId; }
  trackByEmail  (_: number, e: CustomerEmailRow)   { return e.taskId;   }
}