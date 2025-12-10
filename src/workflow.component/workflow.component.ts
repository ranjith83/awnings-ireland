import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd  } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';

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
  customerName: string = '';
  customerId: number | null = null;

  tabs: WorkflowTab[] = [
    { label: 'Workflow', route: '/workflow/list', path: 'list' },
    { label: 'Initial Enquiry', route: '/workflow/initial-enquiry', path: 'initial-enquiry' },
    { label: 'Create Quote', route: '/workflow/create-quote', path: 'create-quote' },
    { label: 'Invite showroom', route: '/workflow/invite-showroom', path: 'invite-showroom' },
    { label: 'Setup site visit', route: '/workflow/setup-site-visit', path: 'setup-site-visit' },
    { label: 'Invoice', route: '/workflow/invoice', path: 'invoice' },
    { label: 'Payment', route: '/workflow/payment', path: 'payment' }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Get customer information from query params
    this.route.queryParams.subscribe(params => {
      this.customerId = params['customerId'] ? +params['customerId'] : null;
      this.customerName = params['customerName'] || 'Customers';
    });

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
    // Pass customer info when navigating between tabs
    this.router.navigate([tab.route], {
      queryParams: {
        customerId: this.customerId,
        customerName: this.customerName
      }
    });
  }

  isActive(tabPath: string): boolean {
    return this.activeTab === tabPath;
  }

  goBackToCustomers(): void {
    this.router.navigate(['/customers']);
  }
}