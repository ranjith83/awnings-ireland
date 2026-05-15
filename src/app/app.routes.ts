import { Routes } from '@angular/router';
import { AppLayoutComponent } from './layout/app-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('../login.component/login.component').then(m => m.LoginComponent)
  },

  {
    path: '',
    component: AppLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',        loadComponent: () => import('../workflow/dashboard.component/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'customers',        loadComponent: () => import('../customer/customer-details/customer-details').then(m => m.CustomerDetails) },
      { path: 'quick-calculator', loadComponent: () => import('./quick-calculator.component/quick-calculator.component').then(m => m.QuickCalculatorComponent) },

      {
        path: 'workflow',
        loadComponent: () => import('../workflow.component/workflow.component').then(m => m.WorkflowComponent),
        children: [
          { path: '', redirectTo: 'list', pathMatch: 'full' },
          { path: 'list',           loadComponent: () => import('../workflow/workflow-list.component/workflow-list.component').then(m => m.WorkflowListComponent) },
          { path: 'initial-enquiry',loadComponent: () => import('../workflow/initial-enquiry.component/initial-enquiry.component').then(m => m.InitialEnquiryComponent) },
          { path: 'create-quote',   loadComponent: () => import('../workflow/create-quote.component/create-quote.component').then(m => m.CreateQuoteComponent) },
          { path: 'invite-showroom',loadComponent: () => import('../workflow/invite-showroom.component/invite-showroom.component').then(m => m.InviteShowroomComponent) },
          { path: 'setup-site-visit',loadComponent: () => import('../workflow/setup-site-visit.component/setup-site-visit.component').then(m => m.SetupSiteVisitComponent) },
          { path: 'final-quote',    loadComponent: () => import('../workflow/final-quote.component/final-quote.component').then(m => m.FinalQuoteComponent) },
          { path: 'invoice',        loadComponent: () => import('../workflow/invoice.component/invoice.component').then(m => m.InvoiceComponent) },
          { path: 'payment',        loadComponent: () => import('../payment/payment.component').then(m => m.PaymentComponent) }
        ]
      },

      { path: 'reports',          loadComponent: () => import('../reports/reports.component').then(m => m.ReportsComponent) },
      { path: 'task',             loadComponent: () => import('../email-task/email-task.component').then(m => m.TaskComponent) },
      { path: 'tasks/:id',        loadComponent: () => import('../task-detail.component/task-detail.component').then(m => m.TaskDetailComponent) },
      { path: 'taskdetail',       loadComponent: () => import('../task-detail.component/task-detail.component').then(m => m.TaskDetailComponent) },
      { path: 'register',         loadComponent: () => import('../register.component/register.component').then(m => m.RegisterComponent) },
      { path: 'user-management',  loadComponent: () => import('../user-management.component/user-management.component').then(m => m.UserManagementComponent) },
      { path: 'audit',            loadComponent: () => import('../audit-history.component/audit-history.component').then(m => m.AuditHistoryComponent) },
      { path: 'followups',        loadComponent: () => import('./follow-up-list.component/follow-up-list.component').then(m => m.FollowUpListComponent) },
      { path: 'configuration',    loadComponent: () => import('./configuration/configuration.component').then(m => m.ConfigurationComponent) },
    ]
  },

  { path: '**', redirectTo: 'login' }
];
