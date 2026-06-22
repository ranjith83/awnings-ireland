import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subject } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../app/environments/environment';
import * as signalR from '@microsoft/signalr';

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

    // Push: backend sends a count-only update
    this.hubConnection.on('UpdateCount', (count: number) => {
      this.ngZone.run(() => this._count.next(count));
    });

    this.hubConnection
      .start()
      .then(() => this.loadInitialCount())
      .catch(() => {
        // SignalR unavailable — fall back to a single fetch, no polling
        this.loadInitialCount();
      });
  }

  stopConnection(): void {
    this.hubConnection?.stop();
    this.hubConnection = undefined;
  }

  /** Fetch current count once on connect — handles both `number` and `{ count }` responses, falls back to item list. */
  private loadInitialCount(): void {
    this.http.get(`${this.apiUrl}/count`)
      .pipe(catchError(() => of(null)))
      .subscribe((res: any) => {
        if (res !== null && res !== undefined) {
          const n = typeof res === 'number' ? res : (res?.count ?? res?.unreadCount ?? res?.total ?? null);
          if (n !== null) { this._count.next(Number(n)); return; }
        }
        // Fallback: load items and derive count from the list
        this.http.get<InboxNotification[]>(this.apiUrl)
          .pipe(catchError(() => of([])))
          .subscribe(items => {
            this._items.next(items);
            this._count.next(items.length);
          });
      });
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
