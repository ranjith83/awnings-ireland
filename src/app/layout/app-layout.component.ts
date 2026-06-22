import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import {
  faChartLine,
  faUsers,
  faProjectDiagram,
  faFileAlt,
  faCog,
  faFileSignature,
  faUserPlus,
  faBell,
  faSlidersH
} from '@fortawesome/free-solid-svg-icons';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService, User } from '../../service/auth.service';
import { ClientConfigService } from '../../service/client-config.service';
import { InboxNotificationService, InboxNotification } from '../../service/inbox-notification.service';

interface MenuItem {
  icon: any; // Changed from string to any for FontAwesome icons
  label: string;
  route: string;
  badge?: number;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppLayoutComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  isSidebarCollapsed = false;
  activeRoute = '';
  currentUser: User | null = null;

  // ── Notification bell ─────────────────────────────────────────────
  unreadCount = 0;
  showNotifDropdown = false;
  notifItems: InboxNotification[] = [];

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (!el.closest('.notif-bell-wrapper')) {
      this.showNotifDropdown = false;
    }
  }

  menuItems: MenuItem[] = [
    { icon: faChartLine, label: 'Dashboard', route: '/dashboard' },
    { icon: faUsers, label: 'Customers', route: '/customers' },
    { icon: faProjectDiagram, label: 'Workflow', route: '/workflow' },
    { icon: faFileAlt, label: 'Reports', route: '/reports' },
   // { icon: faCog, label: 'Settings', route: '/settings' },
    { icon: faCog, label: 'Task', route: '/task' },
    { icon: faBell, label: 'Follow Ups', route: '/followups' },
    { icon: faUserPlus, label: 'User Register', route: '/user-management' },
    { icon: faFileSignature, label: 'Audit', route: '/audit' },
    { icon: faSlidersH, label: 'Configuration', route: '/configuration' }
  ];

  
  constructor(
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    public clientConfig: ClientConfigService,
    private inboxNotif: InboxNotificationService
  ) {
    this.activeRoute = this.router.url;
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    const token = this.authService.getToken() ?? '';
    this.inboxNotif.startConnection(token);
    this.inboxNotif.count$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.unreadCount = c;
      this.cdr.markForCheck();
    });
    this.inboxNotif.items$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.notifItems = items;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.inboxNotif.stopConnection();
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleNotifDropdown(): void {
    this.showNotifDropdown = !this.showNotifDropdown;
    if (this.showNotifDropdown) this.inboxNotif.loadItems();
  }

  markNotifRead(notif: InboxNotification): void {
    this.inboxNotif.markRead(notif.id);
    this.showNotifDropdown = false;

    if (notif.type === 'enquiry_reply_ready' && notif.workflowId) {
      this.router.navigate(
        [`/${this.clientConfig.routePrefix}/workflow/initial-enquiry`],
        { queryParams: { workflowId: notif.workflowId, customerId: notif.entityId ?? '' } }
      );
    } else if (notif.workflowId) {
      this.router.navigate(
        [`/${this.clientConfig.routePrefix}/workflow`],
        { queryParams: { customerId: notif.entityId } }
      );
    }
  }

  markAllNotifRead(): void {
    this.inboxNotif.markAllRead();
  }

  loadCurrentUser(): void {
    this.currentUser = this.authService.getCurrentUser();

    this.authService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUser = user;
      this.cdr.markForCheck();
    });
  }

  get userDisplayName(): string {
    if (!this.currentUser) return 'User';
    if (this.currentUser.firstName && this.currentUser.lastName) {
      return `${this.currentUser.firstName} ${this.currentUser.lastName}`;
    } else if (this.currentUser.firstName) {
      return this.currentUser.firstName;
    }
    return this.currentUser.username;
  }

  get userInitials(): string {
    if (!this.currentUser) return 'U';
    if (this.currentUser.firstName && this.currentUser.lastName) {
      return `${this.currentUser.firstName.charAt(0)}${this.currentUser.lastName.charAt(0)}`.toUpperCase();
    } else if (this.currentUser.firstName) {
      return this.currentUser.firstName.charAt(0).toUpperCase();
    }
    return this.currentUser.username.charAt(0).toUpperCase();
  }

  get userRole(): string {
    return this.currentUser?.role || 'User';
  }


  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  private get prefix(): string { return this.clientConfig.routePrefix; }

  navigateTo(route: string) {
    this.activeRoute = route;
    this.router.navigate([`/${this.prefix}`, ...route.replace(/^\//, '').split('/')]);
  }

  isActive(route: string): boolean {
    return this.router.url.includes(route);
  }

  logout() {
    this.authService.logout();
    this.router.navigate([`/${this.prefix}/login`]);
  }

  get pageTitle(): string {
    return this.menuItems.find(item => this.isActive(item.route))?.label ?? 'Dashboard';
  }
}