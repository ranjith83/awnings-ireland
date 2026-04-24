import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NotificationService, Notification } from '../../../service/notification.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="toast-container">
      <div
        *ngFor="let n of notifications; let i = index"
        class="toast toast-{{ n.type }}">
        <span class="toast-icon">
          {{ n.type === 'success' ? '✓' : n.type === 'error' ? '✕' : n.type === 'warning' ? '⚠' : 'ℹ' }}
        </span>
        <span class="toast-message">{{ n.message }}</span>
        <button class="toast-close" (click)="remove(i)">×</button>
      </div>
    </div>
  `,
  styles: [`
    app-notification {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 99999;
      pointer-events: none;
    }

    .toast-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 420px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      font-size: 14px;
      line-height: 1.4;
      animation: toastIn 0.25s ease-out;
      pointer-events: all;
      min-width: 280px;
      color: #fff;
    }

    @keyframes toastIn {
      from { transform: translateX(110%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    .toast-success { background: #16a34a; }
    .toast-error   { background: #dc2626; }
    .toast-warning { background: #d97706; }
    .toast-info    { background: #2563eb; }

    .toast-icon {
      font-size: 16px;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .toast-message { flex: 1; }

    .toast-close {
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.85);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      transition: color 0.15s;
    }
    .toast-close:hover { color: #fff; }

    @media (max-width: 480px) {
      app-notification { top: 72px; left: 10px; right: 10px; }
      .toast-container { max-width: none; }
    }
  `]
})
export class NotificationComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  private sub?: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit() {
    this.sub = this.notificationService.notification$.subscribe(n => {
      this.notifications.push(n);
      setTimeout(() => this.remove(this.notifications.indexOf(n)), n.duration ?? 3000);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  remove(index: number) {
    if (index >= 0) this.notifications.splice(index, 1);
  }
}
