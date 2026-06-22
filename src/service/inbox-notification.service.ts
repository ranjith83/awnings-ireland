import { Injectable, OnDestroy } from '@angular/core';
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

  constructor(private http: HttpClient) {}

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
    this.hubConnection.on('ReceiveNotification', (payload: { count: number; notification: InboxNotification }) => {
      this._count.next(payload.count);
      if (payload.notification) {
        this._items.next([payload.notification, ...this._items.value]);
        this._newNotif.next(payload.notification);
      }
    });

    // Push: backend sends a count-only update
    this.hubConnection.on('UpdateCount', (count: number) => {
      this._count.next(count);
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

  /** Fetch current count once on connect (not on a timer). */
  private loadInitialCount(): void {
    this.http.get<{ count: number }>(`${this.apiUrl}/count`)
      .pipe(catchError(() => of({ count: 0 })))
      .subscribe(res => this._count.next(res.count));
  }

  /** Load full list for the dropdown. */
  loadItems(): void {
    this.http.get<InboxNotification[]>(this.apiUrl)
      .pipe(catchError(() => of([])))
      .subscribe(items => this._items.next(items));
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
