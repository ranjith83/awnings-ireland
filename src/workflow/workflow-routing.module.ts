import { Routes } from '@angular/router';
import { WorkflowListComponent } from './workflow-list.component/workflow-list.component';
import { CreateQuoteComponent } from './create-quote.component/create-quote.component';
import { WorkflowComponent } from '../workflow.component/workflow.component';

export const workflowRoutes: Routes = [
  {
    path: 'workflow',
    component: WorkflowComponent,
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: WorkflowListComponent },
      //{ path: 'initial-enquiry', component: InitialEnquiryComponent },
      { path: 'create-quote', component: CreateQuoteComponent },
      //{ path: 'invite-showroom', component: InviteShowroomComponent },
      //{ path: 'setup-site-visit', component: SetupSiteVisitComponent },
      //{ path: 'invoice', component: InvoiceComponent }
    ]
  }
];