import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subject } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../app/environments/environment';
import * as signalR from '@microsoft/signalr';

/**
 * Notification types surfaced as the "New Leads" badge, split out of the general inbox:
 *   - new_enquiry         — EmailProcessorService, fired once an InitialEnquiry record exists.
 *   - enquiry_reply_ready — ImportLeadsService, fired for an imported lead before any
 *                           InitialEnquiry exists yet, once its draft reply is ready to review.
 */
const NEW_LEAD_TYPES = ['new_enquiry', 'enquiry_reply_ready'];

export interface InboxNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  workflowId?: number;
  isRead: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class InboxNotificationService implements OnDestroy {
  private apiUrl = `${environment.apiUrl}/api/notification`;
  private hubConnection?: signalR.HubConnection;

  private _count  = new BehaviorSubject<number>(0);
  private _items  = new BehaviorSubject<InboxNotification[]>([]);
  private _newNotif = new Subject<InboxNotification>();

  readonly count$           = this._count.asObservable();
  readonly items$           = this._items.asObservable();
  /** Emits only when a brand-new notification arrives via SignalR push. */
  readonly newNotification$ = this._newNotif.asObservable();

  /** New-lead items and count — powers the sidebar "New Leads" badge. */
  readonly newLeadItems$ = this._items.pipe(map(items => items.filter(n => NEW_LEAD_TYPES.includes(n.type))));
  readonly newLeadsCount$ = this.newLeadItems$.pipe(map(items => items.length));

  /** Everything else — powers the bell dropdown, excluding whatever New Leads already covers. */
  readonly otherItems$ = this._items.pipe(map(items => items.filter(n => !NEW_LEAD_TYPES.includes(n.type))));

  constructor(private http: HttpClient, private ngZone: NgZone) {}

  /** Connect to SignalR hub. Call once from AppLayoutComponent after login. */
  startConnection(token: string): void {
    if (this.hubConnection) return;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/hubs/notifications`, {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Push: backend sends updated count + notification
    // NgZone.run ensures Angular's change detection fires after each SignalR push
    // (SignalR callbacks execute outside Angular's zone by default)
    this.hubConnection.on('ReceiveNotification', (payload: { count: number; notification: InboxNotification }) => {
      this.ngZone.run(() => {
        this._count.next(payload.count);
        if (payload.notification) {
          this._items.next([payload.notification, ...this._items.value]);
          this._newNotif.next(payload.notification);
        }
      });
    });

    // Push: backend sends a count-only update — re-fetch the full list so the
    // per-type (New Leads) breakdown stays accurate, not just the raw total.
    this.hubConnection.on('UpdateCount', () => {
      this.ngZone.run(() => this.loadItems());
    });

    this.hubConnection
      .start()
      .then(() => this.loadItems())
      .catch(() => {
        // SignalR unavailable — fall back to a single fetch, no polling
        this.loadItems();
      });
  }

  stopConnection(): void {
    this.hubConnection?.stop();
    this.hubConnection = undefined;
  }

  /** Load full list for the dropdown — also refreshes the unread count. */
  loadItems(): void {
    this.http.get<InboxNotification[]>(this.apiUrl)
      .pipe(catchError(() => of([])))
      .subscribe(items => {
        this._items.next(items);
        this._count.next(items.length);
      });
  }

  markRead(id: number): void {
    this.http.put(`${this.apiUrl}/${id}/read`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this._items.next(this._items.value.filter(n => n.id !== id));
        this._count.next(Math.max(0, this._count.value - 1));
      });
  }

  markAllRead(): void {
    this.http.put(`${this.apiUrl}/read-all`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this._items.next([]);
        this._count.next(0);
      });
  }

  ngOnDestroy(): void {
    this.stopConnection();
  }
}
