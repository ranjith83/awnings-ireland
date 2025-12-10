import { Component } from '@angular/core';
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
  faUserPlus
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
  selector: 'app-layout', // Fixed: removed .component from selector
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css'
})
export class AppLayoutComponent {
  isSidebarCollapsed = false;
  activeRoute = '';
  currentUser: User | null = null;

  menuItems: MenuItem[] = [
    { icon: faChartLine, label: 'Dashboard', route: '/dashboard' },
    { icon: faUsers, label: 'Customers', route: '/customers' },
    { icon: faProjectDiagram, label: 'Workflow', route: '/workflow', badge: 5 },
   // { icon: faClipboardList, label: 'Follow ups', route: '/followups' },
    { icon: faFileAlt, label: 'Reports', route: '/reports' },
   // { icon: faCog, label: 'Settings', route: '/settings' },
    { icon: faCog, label: 'Task', route: '/task' },
    { icon: faUserPlus, label: 'User Register', route: '/user-management' },
    { icon: faFileSignature, label: 'Audit', route: '/audit' }
  ];

  
  constructor(
    private router: Router,
    private authService: AuthService
  ) {
    this.activeRoute = this.router.url;
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    //this.subscribeToRouteChanges();
  } 

  loadCurrentUser(): void {
    // Get user data from AuthService (already handles platform checks)
    this.currentUser = this.authService.getCurrentUser();
    
    // Optional: Subscribe to user changes
    this.authService.currentUser.subscribe(user => {
      this.currentUser = user;
    });
  }

 getUserDisplayName(): string {
    if (!this.currentUser) return 'User';
    
    // Priority: firstName + lastName > username
    if (this.currentUser.firstName && this.currentUser.lastName) {
      return `${this.currentUser.firstName} ${this.currentUser.lastName}`;
    } else if (this.currentUser.firstName) {
      return this.currentUser.firstName;
    }
    
    return this.currentUser.username;
  }

  getUserInitials(): string {
    if (!this.currentUser) return 'U';
    
    if (this.currentUser.firstName && this.currentUser.lastName) {
      return `${this.currentUser.firstName.charAt(0)}${this.currentUser.lastName.charAt(0)}`.toUpperCase();
    } else if (this.currentUser.firstName) {
      return this.currentUser.firstName.charAt(0).toUpperCase();
    }
    
    return this.currentUser.username.charAt(0).toUpperCase();
  }

  getUserRole(): string {
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

  getPageTitle() {
    const activeItem = this.menuItems.find(item => item.route === this.activeRoute);
    return activeItem?.label || 'Dashboard';
  }
}