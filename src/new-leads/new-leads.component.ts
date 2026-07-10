import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InboxNotification, InboxNotificationService } from '../service/inbox-notification.service';
import { NavService } from '../service/nav.service';

@Component({
  selector: 'app-new-leads',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './new-leads.component.html',
  styleUrl: './new-leads.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewLeadsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  leads: InboxNotification[] = [];

  constructor(
    private inboxNotif: InboxNotificationService,
    private nav: NavService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.inboxNotif.newLeadItems$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.leads = items;
      this.cdr.markForCheck();
    });
    this.inboxNotif.loadItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Jumps to the lead's workflow — same destinations the bell used for these.
   * Deliberately does NOT call inboxNotif.markRead() here: same as the bell, the
   * notification (and this count) should only clear once the reply is actually sent
   * — SendAutoReplyDraft/SendTaskEmail on the backend already do that as a side effect,
   * so simply viewing the lead must not clear it prematurely.
   */
  openLead(lead: InboxNotification): void {
    if (!lead.workflowId) return;

    if (lead.type === 'enquiry_reply_ready') {
      this.nav.go(['/workflow/initial-enquiry'], {
        queryParams: { workflowId: lead.workflowId, customerId: lead.entityId ?? '' }
      });
    } else {
      this.nav.go(['/workflow'], { queryParams: { customerId: lead.entityId } });
    }
  }
}
