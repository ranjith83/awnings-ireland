import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { takeUntil, finalize, catchError } from 'rxjs/operators';

import { WorkflowService, InitialEnquiryDto } from '../../service/workflow.service';
import { EmailTaskService, EmailTask, SendTaskEmailPayload, SendDirectEmailPayload, TaskSourceType } from '../../service/email-task.service';
import { SignatureService, UserSignatureDto } from '../../service/signature.service';

export interface CustomerEmailRow {
  taskId: number; subject: string; fromEmail: string; fromName: string;
  dateAdded: Date; status: string; taskType: string; priority: string;
  emailBody: string; bodyBlobUrl?: string | null; category: string;
}

export interface PendingAttachment {
  fileName: string; contentType: string; base64Content: string; sizeBytes: number;
}

/** All editable fields inside the signature format builder modal. */
export interface SigFormState {
  label:          string;
  fullName:       string;
  jobTitle:       string;
  company:        string;
  phone:          string;
  mobile:         string;
  email:          string;
  website:        string;
  greetingText:   string;
  customGreeting: string;
  separatorStyle: string;
  layoutOrder:    string;
  fontFamily:     string;   // ← NEW
  isDefault:      boolean;
}

// ── Font options ──────────────────────────────────────────────────────────────
export interface FontOption {
  value:     string;   // token stored in DB
  label:     string;   // display name
  css:       string;   // actual CSS font-family value
  preview:   string;   // sample text shown in the font card
}

const FONT_OPTIONS: FontOption[] = [
  { value: 'georgia',   label: 'Georgia',         css: 'Georgia, "Times New Roman", serif',                           preview: 'Aa — Classic & Elegant'   },
  { value: 'times',     label: 'Times New Roman',  css: '"Times New Roman", Times, serif',                             preview: 'Aa — Traditional Serif'    },
  { value: 'palatino',  label: 'Palatino',         css: '"Palatino Linotype", Palatino, "Book Antiqua", serif',        preview: 'Aa — Refined & Literary'   },
  { value: 'garamond',  label: 'Garamond',         css: 'Garamond, "EB Garamond", Georgia, serif',                     preview: 'Aa — Timeless & Scholarly' },
  { value: 'arial',     label: 'Arial',            css: 'Arial, Helvetica, sans-serif',                                preview: 'Aa — Clean & Modern'       },
  { value: 'verdana',   label: 'Verdana',          css: 'Verdana, Geneva, sans-serif',                                 preview: 'Aa — Friendly & Readable'  },
  { value: 'trebuchet', label: 'Trebuchet MS',     css: '"Trebuchet MS", Trebuchet, Arial, sans-serif',                preview: 'Aa — Informal & Fresh'     },
  { value: 'calibri',   label: 'Calibri',          css: 'Calibri, Candara, Segoe, sans-serif',                         preview: 'Aa — Contemporary Office'  },
  { value: 'courier',   label: 'Courier New',      css: '"Courier New", Courier, monospace',                           preview: 'Aa — Typewriter Mono'      },
];

const BLANK_SIG_FORM = (): SigFormState => ({
  label: '', fullName: '', jobTitle: '', company: '',
  phone: '', mobile: '', email: '', website: '',
  greetingText: 'Kindest regards,', customGreeting: '',
  separatorStyle: 'blank_line', layoutOrder: 'name_first',
  fontFamily: 'georgia',
  isDefault: false
});

const GREETING_PRESETS = [
  'Kindest regards,', 'Kind regards,', 'Best regards,',
  'Best wishes,', 'Many thanks,', 'Thanks,',
  'Warm regards,', 'Yours sincerely,', 'Cheers,', 'custom'
];

const SEPARATOR_OPTIONS = [
  { value: 'blank_line',  label: 'Blank line'       },
  { value: 'single_dash', label: '—  (single dash)' },
  { value: 'double_dash', label: '— —  (double dash)' },
  { value: 'none',        label: 'None'              },
];

const LAYOUT_OPTIONS = [
  { value: 'name_first',    label: 'Name → Job Title → Company' },
  { value: 'company_first', label: 'Company → Name → Job Title' },
];

import { NotificationService } from '../../service/notification.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
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
  customerName = ''; customerEmail = '';
  fromFollowUp: number | null = null;
  fromTask: number | null = null;

  // ── Observable state ───────────────────────────────────────────────────────
  isLoadingEnquiries$ = new BehaviorSubject<boolean>(false);
  isLoadingEmails$    = new BehaviorSubject<boolean>(false);
  isSaving$           = new BehaviorSubject<boolean>(false);
  isSendingEmail$     = new BehaviorSubject<boolean>(false);
  isLoadingSigs$      = new BehaviorSubject<boolean>(false);
  isSavingSig$        = new BehaviorSubject<boolean>(false);
  
  

  // ── Data ───────────────────────────────────────────────────────────────────
  enquiries: InitialEnquiryDto[] = [];
  customerEmails: CustomerEmailRow[] = [];
  userSignatures: UserSignatureDto[] = [];

  // ── Exposed constants for template ────────────────────────────────────────
  readonly greetingPresets  = GREETING_PRESETS;
  readonly separatorOptions = SEPARATOR_OPTIONS;
  readonly layoutOptions    = LAYOUT_OPTIONS;
  readonly fontOptions      = FONT_OPTIONS;   // ← NEW

  // ── Add form ───────────────────────────────────────────────────────────────
  newEmail          = '';
  newComments       = '';
  newSignature      = '';
  newSigFontFamily  = 'georgia';   // ← tracks active font for add-form textarea
  sendEmailOnAdd    = true;

  // ── Delete enquiry modal ───────────────────────────────────────────────────
  showDeleteModal     = false;
  deletingEnquiry: InitialEnquiryDto | null = null;
  isDeleting$         = new BehaviorSubject<boolean>(false);

  // ── Edit enquiry modal ─────────────────────────────────────────────────────
  showEditModal     = false;
  editingEnquiry: InitialEnquiryDto | null = null;
  editEmail         = '';
  editComments      = '';
  editSignature     = '';
  editSigFontFamily = 'georgia';   // ← tracks active font for edit-modal textarea
  sendEmailOnUpdate = true;

  // ── Signature builder modal ────────────────────────────────────────────────
  showSigBuilder    = false;
  editingSigId: number | null = null;
  sigForm: SigFormState = BLANK_SIG_FORM();
  sigPreview = '';

  // ── Email preview modal ────────────────────────────────────────────────────
  showEmailModal      = false;
  emailModalTask:     CustomerEmailRow | null = null;
  emailModalBodyHtml: SafeHtml | null = null;
  isLoadingEmailBody  = false;

  // ── Send-email modal ───────────────────────────────────────────────────────
  showSendModal   = false;
  sendModalTaskId: number | null = null;
  sendSubject = ''; sendBody = ''; sendToEmail = '';
  sendPendingAttachments: PendingAttachment[] = [];

  // ── Attachments ────────────────────────────────────────────────────────────
  pendingAttachments: PendingAttachment[] = [];
  editPendingAttachments: PendingAttachment[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private workflowService: WorkflowService,
    private emailTaskService: EmailTaskService,
    private signatureService: SignatureService,
    private sanitizer: DomSanitizer,
    private notificationService: NotificationService,
    private workflowStateService: WorkflowStateService,
    private http: HttpClient) {}

  ngOnInit() {
    this.loadUserSignatures();
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
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

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ── Font helpers ───────────────────────────────────────────────────────────

  /** Resolve a font token to its CSS font-family string. */
  fontCss(token: string): string {
    return FONT_OPTIONS.find(f => f.value === token)?.css
      ?? 'Georgia, "Times New Roman", serif';
  }

  /** Get the FontOption object for a token. */
  fontOption(token: string): FontOption {
    return FONT_OPTIONS.find(f => f.value === token) ?? FONT_OPTIONS[0];
  }

  // ── Signature loading ──────────────────────────────────────────────────────

  loadUserSignatures(): void {
    this.isLoadingSigs$.next(true);
    this.signatureService.getSignatures()
      .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingSigs$.next(false)))
      .subscribe({
        next: (sigs) => {
          this.userSignatures = sigs;
          if (!this.newSignature) {
            const def = sigs.find(s => s.isDefault);
            if (def) {
              this.newSignature     = def.signatureText;
              this.newSigFontFamily = def.fontFamily ?? 'georgia';
            }
          }
        },
        error: () => { /* non-fatal */ }
      });
  }

  // ── Signature picker helpers ───────────────────────────────────────────────

  applySignatureToAdd(sig: UserSignatureDto): void {
    this.newSignature     = sig.signatureText;
    this.newSigFontFamily = sig.fontFamily ?? 'georgia';   // ← apply font
  }

  applySignatureToEdit(sig: UserSignatureDto): void {
    this.editSignature     = sig.signatureText;
    this.editSigFontFamily = sig.fontFamily ?? 'georgia';  // ← apply font
  }

  get defaultSignature(): UserSignatureDto | undefined {
    return this.userSignatures.find(s => s.isDefault);
  }

  // ── Signature builder modal ────────────────────────────────────────────────

  openBuilderForNew(): void {
    this.editingSigId   = null;
    this.sigForm        = BLANK_SIG_FORM();
    this.refreshPreview();
    this.showSigBuilder = true;
  }

  openBuilderForEdit(sig: UserSignatureDto): void {
    this.editingSigId = sig.signatureId ?? null;
    this.sigForm = {
      label:          sig.label,
      fullName:       sig.fullName  ?? '',
      jobTitle:       sig.jobTitle  ?? '',
      company:        sig.company   ?? '',
      phone:          sig.phone     ?? '',
      mobile:         sig.mobile    ?? '',
      email:          sig.email     ?? '',
      website:        sig.website   ?? '',
      greetingText:   GREETING_PRESETS.includes(sig.greetingText) ? sig.greetingText : 'custom',
      customGreeting: GREETING_PRESETS.includes(sig.greetingText) ? '' : sig.greetingText,
      separatorStyle: sig.separatorStyle ?? 'blank_line',
      layoutOrder:    sig.layoutOrder    ?? 'name_first',
      fontFamily:     sig.fontFamily     ?? 'georgia',     // ← restore saved font
      isDefault:      sig.isDefault
    };
    this.refreshPreview();
    this.showSigBuilder = true;
  }

  closeSigBuilder(): void {
    this.showSigBuilder = false;
    this.editingSigId   = null;
    this.sigForm        = BLANK_SIG_FORM();
    this.sigPreview     = '';
  }

  refreshPreview(): void {
    this.sigPreview = this.buildSignatureText(this.sigForm);
  }

  buildSignatureText(f: SigFormState): string {
    const greeting = f.greetingText === 'custom'
      ? (f.customGreeting.trim() || 'Kindest regards,')
      : f.greetingText;

    let sep = '';
    if      (f.separatorStyle === 'blank_line')  sep = '\n';
    else if (f.separatorStyle === 'single_dash') sep = '\n—';
    else if (f.separatorStyle === 'double_dash') sep = '\n— —';

    const nameBlock: string[]    = [];
    const companyBlock: string[] = [];

    if (f.layoutOrder === 'name_first') {
      if (f.fullName) nameBlock.push(f.fullName.trim());
      if (f.jobTitle) nameBlock.push(f.jobTitle.trim());
      if (f.company)  companyBlock.push(f.company.trim());
    } else {
      if (f.company)  companyBlock.push(f.company.trim());
      if (f.fullName) nameBlock.push(f.fullName.trim());
      if (f.jobTitle) nameBlock.push(f.jobTitle.trim());
    }

    const contactLines: string[] = [
      ...(f.layoutOrder === 'name_first' ? [...nameBlock, ...companyBlock] : [...companyBlock, ...nameBlock]),
      ...(f.phone   ? [`Tel: ${f.phone.trim()}`]  : []),
      ...(f.mobile  ? [`Mob: ${f.mobile.trim()}`] : []),
      ...(f.email   ? [f.email.trim()]             : []),
      ...(f.website ? [f.website.trim()]           : []),
    ];

    const parts: string[] = [greeting];
    if (sep) parts.push(sep);
    if (contactLines.length) parts.push(contactLines.join('\n'));
    return parts.join('\n');
  }

  saveSigFromBuilder(): void {
    if (!this.sigForm.label.trim()) { this.showError('Label is required.'); return; }

    const resolvedGreeting = this.sigForm.greetingText === 'custom'
      ? (this.sigForm.customGreeting.trim() || 'Kindest regards,')
      : this.sigForm.greetingText;

    const dto: UserSignatureDto = {
      label:          this.sigForm.label.trim(),
      fullName:       this.sigForm.fullName  || undefined,
      jobTitle:       this.sigForm.jobTitle  || undefined,
      company:        this.sigForm.company   || undefined,
      phone:          this.sigForm.phone     || undefined,
      mobile:         this.sigForm.mobile    || undefined,
      email:          this.sigForm.email     || undefined,
      website:        this.sigForm.website   || undefined,
      greetingText:   resolvedGreeting,
      separatorStyle: this.sigForm.separatorStyle,
      layoutOrder:    this.sigForm.layoutOrder,
      fontFamily:     this.sigForm.fontFamily,              // ← save chosen font
      signatureText:  this.buildSignatureText(this.sigForm),
      isDefault:      this.sigForm.isDefault
    };

    this.isSavingSig$.next(true);
    const req$ = this.editingSigId
      ? this.signatureService.updateSignature(this.editingSigId, dto)
      : this.signatureService.createSignature(dto);

    req$.pipe(takeUntil(this.destroy$), finalize(() => this.isSavingSig$.next(false)))
      .subscribe({
        next: (saved) => {
          if (saved.isDefault)
            this.userSignatures = this.userSignatures.map(s => ({ ...s, isDefault: false }));

          if (this.editingSigId) {
            const idx = this.userSignatures.findIndex(s => s.signatureId === saved.signatureId);
            if (idx !== -1) this.userSignatures[idx] = saved;
            else this.userSignatures = [...this.userSignatures, saved];
          } else {
            this.userSignatures = [...this.userSignatures, saved];
          }
          this.userSignatures = [...this.userSignatures];
          this.showSuccess(this.editingSigId ? 'Signature updated.' : 'Signature saved.');
          this.closeSigBuilder();
        },
        error: () => this.showError('Failed to save signature.')
      });
  }

  setDefaultSig(sig: UserSignatureDto): void {
    if (!sig.signatureId) return;
    this.signatureService.setDefault(sig.signatureId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.userSignatures = this.userSignatures.map(s => ({ ...s, isDefault: s.signatureId === sig.signatureId }));
        this.showSuccess(`"${sig.label}" set as default.`);
      },
      error: () => this.showError('Failed to set default.')
    });
  }

  deleteSig(sig: UserSignatureDto): void {
    if (!sig.signatureId) return;
    this.signatureService.deleteSignature(sig.signatureId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.userSignatures = this.userSignatures.filter(s => s.signatureId !== sig.signatureId); this.showSuccess('Signature deleted.'); },
      error: () => this.showError('Failed to delete signature.')
    });
  }

  // ── Data loading ───────────────────────────────────────────────────────────

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
    this.emailTaskService.getTasksByCustomer(customerId, TaskSourceType.Email)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isLoadingEmails$.next(false)))
      .subscribe({
        next: (tasks: EmailTask[]) => {
          this.customerEmails = tasks.map(t => ({
            taskId: t.taskId, subject: t.subject ?? '', fromEmail: t.fromEmail ?? '',
            fromName: t.fromName ?? '', dateAdded: new Date(t.dateAdded),
            status: t.status, taskType: t.taskType ?? '', priority: t.priority,
            emailBody: t.emailBody ?? '', bodyBlobUrl: t.bodyBlobUrl ?? null, category: t.category ?? ''
          }));
          if (!this.newEmail && tasks.length) {
            const first = tasks.find(t => t.fromEmail);
            if (first) { this.newEmail = first.fromEmail ?? ''; this.customerEmail = first.fromEmail ?? ''; }
          }
        },
        error: () => this.showError('Failed to load customer emails.')
      });
  }

  // ── Add enquiry ────────────────────────────────────────────────────────────

  addEnquiry() {
    if (!this.workflowId) { this.showError('No workflow selected.'); return; }
    if (!this.newComments.trim()) { this.showError('Please enter enquiry comments.'); return; }

    const imagesJson = this.pendingAttachments.length
      ? JSON.stringify(this.pendingAttachments.map(a => ({
          fileName: a.fileName, contentType: a.contentType,
          sizeBytes: a.sizeBytes, base64Content: a.base64Content }))) : undefined;

    const dto: InitialEnquiryDto = {
      workflowId: this.workflowId, email: this.newEmail.trim(),
      comments: this.newComments.trim(), images: imagesJson,
      signature: this.newSignature.trim() || null
    };

    const emailToSend     = this.newEmail.trim();
    const commentsToSend  = this.newComments.trim();
    const signatureToSend = this.newSignature.trim();
    const shouldSend      = this.sendEmailOnAdd;
    const attachsToSend   = [...this.pendingAttachments];

    this.isSaving$.next(true);
    this.workflowService.addInitialEnquiry(dto)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSaving$.next(false)))
      .subscribe({
        next: (saved) => {
          this.enquiries = [saved, ...this.enquiries];
          this.newComments = '';
          const def = this.defaultSignature;
          this.newSignature     = def?.signatureText  ?? '';
          this.newSigFontFamily = def?.fontFamily     ?? 'georgia';
          this.pendingAttachments = [];
          this.showSuccess('Enquiry added successfully!');
          this.workflowStateService.notifyStepCompleted('initial-enquiry');
          if (shouldSend && emailToSend)
            this.dispatchDirectEmail(emailToSend, `Re: Initial Enquiry – ${this.customerName}`,
              this.buildEmailBody(commentsToSend, signatureToSend), attachsToSend);
        },
        error: () => this.showError('Failed to add enquiry.')
      });
  }

  // ── Delete enquiry modal ───────────────────────────────────────────────────

  openDeleteModal(enquiry: InitialEnquiryDto) {
    this.deletingEnquiry = enquiry;
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal  = false;
    this.deletingEnquiry  = null;
  }

  confirmDelete() {
    if (!this.deletingEnquiry?.enquiryId) return;
    const id = this.deletingEnquiry.enquiryId;
    this.isDeleting$.next(true);
    this.workflowService.deleteInitialEnquiry(id)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isDeleting$.next(false)))
      .subscribe({
        next: () => {
          this.enquiries = this.enquiries.filter(e => e.enquiryId !== id);
          this.showSuccess('Enquiry deleted.');
          this.closeDeleteModal();
        },
        error: () => this.showError('Failed to delete enquiry.')
      });
  }

  // ── Edit enquiry modal ─────────────────────────────────────────────────────

  openEditModal(enquiry: InitialEnquiryDto) {
    this.editingEnquiry    = { ...enquiry };
    this.editEmail         = enquiry.email;
    this.editComments      = enquiry.comments;
    this.editSignature     = enquiry.signature ?? this.defaultSignature?.signatureText ?? '';
    this.editSigFontFamily = this.defaultSignature?.fontFamily ?? 'georgia';
    this.sendEmailOnUpdate = true;
    this.editPendingAttachments = [];
    this.showEditModal     = true;
    this.notificationService.error('');
  }

  closeEditModal() {
    this.showEditModal = false; this.editingEnquiry = null;
    this.editEmail = this.editComments = this.editSignature = '';
    this.editSigFontFamily = 'georgia';
    this.editPendingAttachments = [];
  }

  saveEdit() {
    if (!this.editingEnquiry) return;
    if (!this.editComments.trim()) { this.showError('Comments are required.'); return; }

    let existingAtts: PendingAttachment[] = [];
    try { if (this.editingEnquiry.images) existingAtts = JSON.parse(this.editingEnquiry.images); } catch {}
    const allAtts    = [...existingAtts, ...this.editPendingAttachments];
    const imagesJson = allAtts.length ? JSON.stringify(allAtts) : undefined;

    const dto: InitialEnquiryDto = {
      ...this.editingEnquiry,
      email: this.editEmail.trim(), comments: this.editComments.trim(),
      images: imagesJson, signature: this.editSignature.trim() || null
    };

    this.isSaving$.next(true);
    this.workflowService.updateInitialEnquiry(dto)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSaving$.next(false)))
      .subscribe({
        next: (updated) => {
          const idx = this.enquiries.findIndex(e => e.enquiryId === updated.enquiryId);
          if (idx !== -1) this.enquiries[idx] = updated;
          this.enquiries = [...this.enquiries];
          if (this.sendEmailOnUpdate && this.editEmail.trim())
            this.dispatchDirectEmail(this.editEmail.trim(), `Enquiry Update – ${this.customerName}`,
              this.buildEmailBody(this.editComments.trim(), this.editSignature.trim()),
              this.editPendingAttachments);
          this.showSuccess('Enquiry updated successfully!'); this.closeEditModal();
        },
        error: () => this.showError('Failed to update enquiry.')
      });
  }

  // ── Email preview ──────────────────────────────────────────────────────────

  openEmailPreview(row: CustomerEmailRow) {
    this.emailModalTask    = row;
    this.emailModalBodyHtml = null;
    this.showEmailModal    = true;

    if (row.bodyBlobUrl) {
      this.isLoadingEmailBody = true;
      this.http.get(row.bodyBlobUrl, { responseType: 'text' })
        .pipe(takeUntil(this.destroy$), catchError(() => of(row.emailBody)))
        .subscribe(html => {
          this.emailModalBodyHtml = html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
          this.isLoadingEmailBody = false;
        });
    } else {
      this.emailModalBodyHtml = row.emailBody ? this.sanitizer.bypassSecurityTrustHtml(row.emailBody) : null;
      this.isLoadingEmailBody = false;
    }
  }
  closeEmailPreview() { this.showEmailModal = false; this.emailModalTask = null; this.emailModalBodyHtml = null; }

  // ── Send-email modal ───────────────────────────────────────────────────────

  openSendModal(row: CustomerEmailRow) {
    this.sendModalTaskId = row.taskId; this.sendToEmail = row.fromEmail;
    this.sendSubject = `Re: ${row.subject}`; this.sendBody = '';
    this.showSendModal = true; this.notificationService.error('');
  }
  closeSendModal() {
    this.showSendModal = false; this.sendModalTaskId = null;
    this.sendSubject = this.sendBody = this.sendToEmail = '';
    this.sendPendingAttachments = [];
  }

  sendEmail() {
    if (!this.sendModalTaskId) return;
    if (!this.sendBody.trim()) { this.showError('Please enter an email body.'); return; }
    const payload: SendTaskEmailPayload = {
      toEmail: this.sendToEmail, subject: this.sendSubject, body: this.sendBody,
      attachments: this.sendPendingAttachments.length
        ? this.sendPendingAttachments.map(a => ({ fileName: a.fileName, base64Content: a.base64Content, contentType: a.contentType }))
        : undefined
    };
    this.isSendingEmail$.next(true);
    this.emailTaskService.sendTaskEmail(this.sendModalTaskId, payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({
        next: () => { this.showSuccess('Email sent successfully!'); this.closeSendModal(); },
        error: () => this.showError('Failed to send email.')
      });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildEmailBody(body: string, sig: string): string {
    return sig?.trim() ? `${body}\n\n-- \n${sig.trim()}` : body;
  }

  private dispatchDirectEmail(toEmail: string, subject: string, body: string,
      attachments: PendingAttachment[] = [], onSuccess?: () => void) {
    if (!toEmail?.trim()) { onSuccess?.(); return; }
    const payload: SendDirectEmailPayload = {
      toEmail, subject, body,
      attachments: attachments.length
        ? attachments.map(a => ({ fileName: a.fileName, base64Content: a.base64Content, contentType: a.contentType }))
        : undefined
    };
    this.isSendingEmail$.next(true);
    this.emailTaskService.sendDirectEmail(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({ next: () => onSuccess?.(), error: () => this.showError('Enquiry saved, but the email could not be sent.') });
  }

  private showSuccess(msg: string) { this.notificationService.success(msg);  }
  private showError(msg: string)   { this.notificationService.error(msg);    }

  // ── Attachment helpers ─────────────────────────────────────────────────────

  onFilesSelected(event: Event, target: 'add' | 'edit' | 'send'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const att: PendingAttachment = { fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          base64Content: (reader.result as string).split(',')[1], sizeBytes: file.size };
        if (target === 'add')  this.pendingAttachments     = [...this.pendingAttachments, att];
        if (target === 'edit') this.editPendingAttachments = [...this.editPendingAttachments, att];
        if (target === 'send') this.sendPendingAttachments = [...this.sendPendingAttachments, att];
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  removeAttachment(index: number, target: 'add' | 'edit' | 'send'): void {
    if (target === 'add')  this.pendingAttachments     = this.pendingAttachments.filter((_,i) => i !== index);
    if (target === 'edit') this.editPendingAttachments = this.editPendingAttachments.filter((_,i) => i !== index);
    if (target === 'send') this.sendPendingAttachments = this.sendPendingAttachments.filter((_,i) => i !== index);
  }

  getEnquiryAttachments(enq: InitialEnquiryDto): PendingAttachment[] {
    if (!enq.images) return [];
    try { return JSON.parse(enq.images); } catch { return []; }
  }

  downloadEnquiryAttachment(att: PendingAttachment): void {
    const link = document.createElement('a');
    link.href = `data:${att.contentType};base64,${att.base64Content}`;
    link.download = att.fileName;
    link.click();
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
  }

  fileIcon(ct: string): string {
    if (ct?.includes('pdf'))   return '📄';
    if (ct?.includes('image')) return '🖼️';
    if (ct?.includes('word'))  return '📝';
    if (ct?.includes('excel') || ct?.includes('spreadsheet')) return '📊';
    return '📎';
  }

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
  trackByEmail  (_: number, e: CustomerEmailRow)   { return e.taskId; }
  trackBySig    (_: number, s: UserSignatureDto)   { return s.signatureId; }
}