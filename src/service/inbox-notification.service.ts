import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { catchError, switchMap, startWith } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../app/environments/environment';

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
  private pollSub?: Subscription;

  private _count = new BehaviorSubject<number>(0);
  private _items = new BehaviorSubject<InboxNotification[]>([]);

  readonly count$ = this._count.asObservable();
  readonly items$ = this._items.asObservable();

  constructor(private http: HttpClient) {}

  /** Start polling every 30 s. Call once from AppLayoutComponent. */
  startPolling(): void {
    if (this.pollSub) return;
    this.pollSub = interval(30_000)
      .pipe(startWith(0), switchMap(() =>
        this.http.get<{ count: number }>(`${this.apiUrl}/count`)
          .pipe(catchError(() => of({ count: 0 })))
      ))
      .subscribe(res => this._count.next(res.count));
  }

  stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
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
    this.stopPolling();
  }
}
