import { Routes } from '@angular/router';
import { AppLayoutComponent } from './layout/app-layout.component';
import { WorkflowComponent } from '../workflow.component/workflow.component';
import { CustomerDetails } from '../customer/customer-details/customer-details';
import { CreateQuoteComponent } from '../workflow/create-quote.component/create-quote.component';
import { WorkflowListComponent } from '../workflow/workflow-list.component/workflow-list.component';
import { InviteShowroomComponent } from '../workflow/invite-showroom.component/invite-showroom.component';
import { SetupSiteVisitComponent } from '../workflow/setup-site-visit.component/setup-site-visit.component';
import { InvoiceComponent } from '../workflow/invoice.component/invoice.component';
import { InitialEnquiryComponent } from '../workflow/initial-enquiry.component/initial-enquiry.component';
import { DashboardComponent } from '../workflow/dashboard.component/dashboard.component';
import { TaskDetailComponent } from '../task-detail.component/task-detail.component';
import { ReportsComponent } from '../reports/reports.component';
import { TaskComponent } from '../task.component/task.component';
import { AuthGuard } from '../guards/auth-guard';
import { LoginComponent } from '../login.component/login.component';
import { RegisterComponent } from '../register.component/register.component';
import { UserManagementComponent } from '../user-management.component/user-management.component';
import { AuditHistoryComponent } from '../audit-history.component/audit-history.component';
import { PaymentComponent } from '../payment/payment.component';
import { QuickCalculatorComponent } from './quick-calculator.component/quick-calculator.component';
import { EmailTaskComponent } from '../email-task/email-task.component';

export const routes: Routes = [
  // Public routes (NO AppLayoutComponent - no sidebar/header)
  { 
    path: 'login', 
    component: LoginComponent 
  },
  
  // Protected routes (WITH AppLayoutComponent - has sidebar/header)
  {
    path: '',
    component: AppLayoutComponent,
    //canActivate: [AuthGuard], // Uncomment this when AuthGuard is ready
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'customers', component: CustomerDetails },
      {  path: 'quick-calculator',  component: QuickCalculatorComponent },
      // Workflow routes with nested children
      { 
        path: 'workflow',
        component: WorkflowComponent,
        children: [
          { path: '', redirectTo: 'list', pathMatch: 'full' },
          { path: 'list', component: WorkflowListComponent },
          { path: 'initial-enquiry', component: InitialEnquiryComponent },
          { path: 'create-quote', component: CreateQuoteComponent },
          { path: 'invite-showroom', component: InviteShowroomComponent },
          { path: 'setup-site-visit', component: SetupSiteVisitComponent },
          { path: 'invoice', component: InvoiceComponent },
          { path: 'payment', component: PaymentComponent }
        ]
      },
      
      // Reports
      { path: 'reports', component: ReportsComponent },
      
      // Tasks
      { path: 'task', component: EmailTaskComponent },
      { path: 'tasks', component: TaskComponent }, // Alias for consistency
      { path: 'tasks/:id', component: TaskDetailComponent },
      { path: 'taskdetail', component: TaskDetailComponent },
      {  path: 'register', component: RegisterComponent },
      {  path: 'user-management',  component: UserManagementComponent },
      {  path: 'audit',  component: AuditHistoryComponent },
      
    ]
  },

  // Fallback - redirect to login if no route matches
  { path: '**', redirectTo: 'login' }
];