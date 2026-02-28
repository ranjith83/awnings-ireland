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

  // ── All params preserved so tab navigation never loses context ──────────
  private _allParams: Record<string, any> = {};

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
    // Capture ALL query params from child routes via the router URL
    // We subscribe to the root route's queryParams via Router so we catch
    // params set by child components (e.g. workflowId added by workflow-list).
    this.route.queryParams.subscribe(params => {
      // Merge new params into our store (child screens may add workflowId etc.)
      this._allParams = { ...this._allParams, ...params };
      this.customerId   = params['customerId']   ? +params['customerId']   : this.customerId;
      this.customerName = params['customerName'] || this.customerName || 'Customers';
    });

    // Also keep _allParams up-to-date after each child navigation
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      // Parse query string from current URL
      const urlTree   = this.router.parseUrl(this.router.url);
      const qp        = urlTree.queryParams;
      if (Object.keys(qp).length) {
        this._allParams = { ...this._allParams, ...qp };
        if (qp['customerId'])   this.customerId   = +qp['customerId'];
        if (qp['customerName']) this.customerName = qp['customerName'];
      }
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
    // Forward ALL captured params so no context is lost between tabs
    this.router.navigate([tab.route], {
      queryParams: this._allParams
    });
  }

  isActive(tabPath: string): boolean {
    return this.activeTab === tabPath;
  }

  goBackToCustomers(): void {
    this.router.navigate(['/customers']);
  }
}