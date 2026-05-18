import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import {
  faChartLine,
  faUsers,
  faProjectDiagram,
  faClipboardList,
  faFileAlt,
  faCog,
  faFileSignature,
  faUserPlus,
  faBell,
  faSlidersH
} from '@fortawesome/free-solid-svg-icons';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AuthService, User } from '../../service/auth.service';

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
    private cdr: ChangeDetectorRef
  ) {
    this.activeRoute = this.router.url;
  }

  ngOnInit(): void {
    this.loadCurrentUser();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  navigateTo(route: string) {
    this.activeRoute = route;
    this.router.navigate([route]);
  }

  isActive(route: string): boolean {
    return this.activeRoute === route;
  }

  logout() {
    console.log('Logging out...');
    this.authService.logout(); // Uncommented this
    this.router.navigate(['/login']);
  }

  get pageTitle(): string {
    return this.menuItems.find(item => item.route === this.activeRoute)?.label ?? 'Dashboard';
  }
}