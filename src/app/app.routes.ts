import { Routes } from '@angular/router';
import { AppLayoutComponent } from './layout/app-layout.component';
import { WorkflowComponent } from '../workflow.component/workflow.component';
import { CustomerDetails } from '../customer/customer-details/customer-details';
import { CreateQuoteComponent } from '../workflow/create-quote.component/create-quote.component';
import { WorkflowListComponent } from '../workflow/workflow-list.component/workflow-list.component';
import { InviteShowroomComponent } from '../workflow/invite-showroom.component/invite-showroom.component';
import { SetupSiteVisitComponent } from '../workflow/setup-site-visit.component/setup-site-visit.component';
import { InvoiceComponent } from '../workflow/invoice.component/invoice.component';


export const routes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      //{ path: 'dashboard', component: DashboardComponent },
      { path: 'customers', component: CustomerDetails },
     // { path: 'workflow', component: CreateQuoteComponent },
      { path: 'workflow',
        component: WorkflowComponent,
        children: [
          { path: '', redirectTo: 'list', pathMatch: 'full' },
          { path: 'list', component: WorkflowListComponent },
       //   { path: 'initial-enquiry', component: InitialEnquiryComponent },
          { path: 'create-quote', component: CreateQuoteComponent },
          { path: 'invite-showroom', component: InviteShowroomComponent },
          { path: 'setup-site-visit', component: SetupSiteVisitComponent },
          { path: 'invoice', component: InvoiceComponent }
        ]
      }
     /* { path: 'calendar', component: CalendarComponent },
      { path: 'showroom', component: ShowroomComponent },
      { path: 'site-visits', component: SiteVisitsComponent },
      { path: 'invoices', component: InvoicesComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'settings', component: SettingsComponent } */
    ]
  },
 // { path: 'login', component: LoginComponent }
];