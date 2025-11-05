import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import {
  faChartLine,
  faUsers,
  faProjectDiagram,
  faClipboardList,
  faFileAlt,
  faCog
} from '@fortawesome/free-solid-svg-icons';



import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';


interface MenuItem {
  icon: string;
  label: string;
  route: string;
  badge?: number;
}

@Component({
  selector: 'app-layout.component',
  standalone: true,
  imports: [CommonModule, RouterModule, FontAwesomeModule],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.css'
})

export class AppLayoutComponent {
  isSidebarCollapsed = false;
  activeRoute = '';

  /**
    menuItems: MenuItem[] = [
      { icon: '📊', label: 'Dashboard', route: '/dashboard' },
      { icon: '👥', label: 'Customers', route: '/customers' },
      { icon: '🔄', label: 'Workflow', route: '/workflow', badge: 5 },
      { icon: '📄', label: 'Follow ups', route: '/followups' },
      { icon: '📈', label: 'Reports', route: '/reports' },
      { icon: '⚙️', label: 'Settings', route: '/settings' }
  ];
  */

  menuItems = [
  { icon: faChartLine, label: 'Dashboard', route: '/dashboard' },
  { icon: faUsers, label: 'Customers', route: '/customers' },
  { icon: faProjectDiagram, label: 'Workflow', route: '/workflow', badge: 5 },
  { icon: faClipboardList, label: 'Follow ups', route: '/followups' },
  { icon: faFileAlt, label: 'Reports', route: '/reports' },
  { icon: faCog, label: 'Settings', route: '/settings' }
];


  constructor(private router: Router) {
    this.activeRoute = this.router.url;
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
    // Implement logout logic
    console.log('Logging out...');
    this.router.navigate(['/login']);
  }

  getPageTitle() {
    const activeItem = this.menuItems.find(item => item.route === this.activeRoute);
    return activeItem?.label;
  }
}