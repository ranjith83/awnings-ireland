import {
  Component, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { FollowUpDto, FollowUpService } from '../../service/follow-up.service';


@Component({
  selector: 'app-follow-up-list.component',
    imports: [CommonModule, FormsModule],
  templateUrl: './follow-up-list.component.html',
  styleUrl: './follow-up-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FollowUpListComponent  implements OnInit, OnDestroy {

   private destroy$ = new Subject<void>();

  // ── Data ──────────────────────────────────────────────────────────────────
  followUps: FollowUpDto[] = [];

  // ── Loading state ─────────────────────────────────────────────────────────
  isLoading$    = new BehaviorSubject<boolean>(false);
  isGenerating$ = new BehaviorSubject<boolean>(false);

  // ── Feedback messages ─────────────────────────────────────────────────────
  successMessage$ = new BehaviorSubject<string>('');
  errorMessage$   = new BehaviorSubject<string>('');

  // ── Dismiss modal ─────────────────────────────────────────────────────────
  showDismissModal    = false;
  dismissingFollowUp: FollowUpDto | null = null;
  dismissNotes        = '';
  isDismissing$       = new BehaviorSubject<boolean>(false);

  // ── Toggle dismissed rows ─────────────────────────────────────────────────
  showDismissed = false;

  // ── Detail preview panel (hover / click on row) ───────────────────────────
  previewFollowUp: FollowUpDto | null = null;

  // ── Email preview modal (enquiry comments parsed as HTML) ─────────────────
  showEmailPreviewModal = false;
  emailPreviewFollowUp: FollowUpDto | null = null;

  openEmailPreviewModal(event: MouseEvent, followUp: FollowUpDto): void {
    event.stopPropagation();
    this.emailPreviewFollowUp = followUp;
    this.showEmailPreviewModal = true;
    this.cdr.markForCheck();
  }

  closeEmailPreviewModal(): void {
    this.showEmailPreviewModal = false;
    this.emailPreviewFollowUp = null;
    this.cdr.markForCheck();
  }

  /** Strips HTML tags to get plain text for truncated table preview. */
  stripHtml(html: string | null | undefined): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

constructor(
    private followUpService: FollowUpService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.generateAndLoad();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Generate + Load ───────────────────────────────────────────────────────

  generateAndLoad(): void {
    this.isGenerating$.next(true);
    this.previewFollowUp = null;

    this.followUpService.generateFollowUps()
      .pipe(takeUntil(this.destroy$), finalize(() => this.isGenerating$.next(false)))
      .subscribe({
        next: (res) => {
          if (res.created > 0) {
            this.showSuccess(`${res.created} new follow-up${res.created > 1 ? 's' : ''} generated.`);
          }
          this.loadFollowUps();
        },
        error: () => this.loadFollowUps()   // still load cached data on scan error
      });
  }

  loadFollowUps(): void {
    this.isLoading$.next(true);
    const obs = this.showDismissed
      ? this.followUpService.getAllFollowUps()
      : this.followUpService.getActiveFollowUps();

    obs.pipe(takeUntil(this.destroy$), finalize(() => this.isLoading$.next(false)))
      .subscribe({
        next: (data) => {
          this.followUps = data;
          this.cdr.markForCheck();
        },
        error: () => {
          this.showError('Failed to load follow-ups. Please try again.');
          this.cdr.markForCheck();
        }
      });
  }

  onRefresh(): void { this.generateAndLoad(); }

  toggleShowDismissed(): void {
    this.showDismissed = !this.showDismissed;
    this.previewFollowUp = null;
    this.loadFollowUps();
  }

  // ── Row click → navigate to Initial Enquiry screen ───────────────────────

  /**
   * PRIMARY ACTION: clicking a follow-up row navigates to the
   * Initial Enquiry screen for that workflow so the user can add a new
   * enquiry (which resets the 3-day follow-up timer automatically).
   */
  onRowClick(followUp: FollowUpDto): void {
    if (followUp.isDismissed) return;   // dismissed rows are read-only
    this.router.navigate(['/workflow/initial-enquiry'], {
      queryParams: {
        workflowId:    followUp.workflowId,
        customerId:    followUp.customerId ?? '',
        customerEmail: followUp.enquiryEmail ?? '',   // ← pre-populate email in Initial Enquiry
        customerName:  followUp.companyName  ?? '',
        fromFollowUp:  followUp.followUpId            // lets the initial-enquiry screen show a banner
      }
    });
  }

  // ── Detail preview on hover ───────────────────────────────────────────────

  setPreview(followUp: FollowUpDto | null): void {
    this.previewFollowUp = followUp;
    this.cdr.markForCheck();
  }

  // ── Dismiss modal ─────────────────────────────────────────────────────────

  openDismissModal(event: MouseEvent, followUp: FollowUpDto): void {
    event.stopPropagation();   // don't trigger row click navigation
    this.dismissingFollowUp = followUp;
    this.dismissNotes       = '';
    this.showDismissModal   = true;
    this.cdr.markForCheck();
  }

  closeDismissModal(): void {
    this.showDismissModal   = false;
    this.dismissingFollowUp = null;
    this.dismissNotes       = '';
  }

  confirmDismiss(): void {
    if (!this.dismissingFollowUp) return;
    const id = this.dismissingFollowUp.followUpId;

    this.isDismissing$.next(true);
    this.followUpService.dismissFollowUp(id, this.dismissNotes)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isDismissing$.next(false)))
      .subscribe({
        next: () => {
          this.followUps = this.followUps.filter(f => f.followUpId !== id);
          if (this.previewFollowUp?.followUpId === id) this.previewFollowUp = null;
          this.showSuccess('Follow-up dismissed successfully.');
          this.closeDismissModal();
          this.cdr.markForCheck();
        },
        error: () => this.showError('Failed to dismiss follow-up. Please try again.')
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Number of days since the last enquiry date.
   * Used for the "X days overdue" badge in the grid.
   */
  getDaysOverdue(lastEnquiryDate: string): number {
    const ms = Date.now() - new Date(lastEnquiryDate).getTime();
    return Math.floor(ms / 86_400_000);
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  formatDateShort(date: string | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IE', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  commentsPreview(comments: string | null | undefined): string {
    if (!comments) return '—';
    return comments.length > 120 ? comments.slice(0, 120) + '…' : comments;
  }

  private showSuccess(msg: string): void {
    this.successMessage$.next(msg);
    setTimeout(() => { this.successMessage$.next(''); this.cdr.markForCheck(); }, 4000);
  }

  private showError(msg: string): void {
    this.errorMessage$.next(msg);
    setTimeout(() => { this.errorMessage$.next(''); this.cdr.markForCheck(); }, 4000);
  }
}