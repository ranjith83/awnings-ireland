import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../service/notification.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notification-container">
      <div 
        *ngFor="let notification of notifications; let i = index"
        class="notification"
       
        [@slideIn]>
        <div class="notification-icon">
          <!--<span *ngIf="notification. === 'success'">✓</span>
          <span *ngIf="notification.type === 'error'">✕</span>
          <span *ngIf="notification.type === 'warning'">⚠</span>
          <span *ngIf="notification.type === 'info'">ℹ</span>-->
        </div>
       <!-- <div class="notification-message">{{ notification.message }}</div>-->
        <button class="notification-close" (click)="remove(i)">×</button>
      </div>
    </div>
  `,
  styles: [`
    .notification-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    }

    .notification {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease-out;
      min-width: 300px;
    }

    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .notification-success {
      background: #10b981;
      color: white;
    }

    .notification-error {
      background: #ef4444;
      color: white;
    }

    .notification-warning {
      background: #f59e0b;
      color: white;
    }

    .notification-info {
      background: #3b82f6;
      color: white;
    }

    .notification-icon {
      font-size: 20px;
      font-weight: bold;
      flex-shrink: 0;
    }

    .notification-message {
      flex: 1;
      font-size: 14px;
      line-height: 1.4;
    }

    .notification-close {
      background: transparent;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      flex-shrink: 0;
      transition: background 0.2s;
    }

    .notification-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    @media (max-width: 768px) {
      .notification-container {
        left: 10px;
        right: 10px;
        max-width: none;
      }

      .notification {
        min-width: auto;
      }
    }
  `]
})
export class NotificationComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  private subscription?: Subscription;

  constructor(private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.subscription = this.notificationService.notification$.subscribe(
      (notification) => {
       // this.notifications.push(notification);
        
        // Auto-remove after duration
        setTimeout(() => {
          this.remove(0);
        }, notification.duration || 3000);
      }
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  remove(index: number): void {
    this.notifications.splice(index, 1);
  }
}
