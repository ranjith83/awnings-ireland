import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd  } from '@angular/router';
import { filter } from 'rxjs/operators';

interface WorkflowTab {
  label: string;
  route: string;
  path: string;
}

@Component({
  selector: 'app-workflow',
  standalone: true,
   imports: [CommonModule, RouterModule],
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.css']
})
export class WorkflowComponent implements OnInit {
 activeTab = 'list';

  tabs: WorkflowTab[] = [
    { label: 'Workflow', route: '/workflow/list', path: 'list' },
    { label: 'Intial Enquiry', route: '/workflow/initial-enquiry', path: 'initial-enquiry' },
    { label: 'Create Quote', route: '/workflow/create-quote', path: 'create-quote' },
    { label: 'Invite showroom', route: '/workflow/invite-showroom', path: 'invite-showroom' },
    { label: 'Setup site visit', route: '/workflow/setup-site-visit', path: 'setup-site-visit' },
    { label: 'Invoice', route: '/workflow/invoice', path: 'invoice' }
  ];

  constructor(private router: Router) {}

  ngOnInit() {
    // Set active tab based on current route
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.updateActiveTab();
    });
    
    this.updateActiveTab();
  }

  updateActiveTab() {
    const currentUrl = this.router.url;
    const activeTabObj = this.tabs.find(tab => currentUrl.includes(tab.path));
    if (activeTabObj) {
      this.activeTab = activeTabObj.path;
    }
  }

  navigateToTab(tab: WorkflowTab) {
    this.activeTab = tab.path;
    this.router.navigate([tab.route]);
  }

  isActive(tabPath: string): boolean {
    return this.activeTab === tabPath;
  }
}