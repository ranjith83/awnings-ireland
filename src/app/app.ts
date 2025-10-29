import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CustomerDetails } from "../customer/customer-details/customer-details";
import { CreateQuoteComponent } from "../workflow/create-quote.component/create-quote.component";
import { WorkflowComponent } from "../workflow.component/workflow.component";
import { CommonModule } from '@angular/common';
import { LoadingSpinnerComponent } from './components/loading-spinner/loading-spinner.component';
import { NotificationComponent } from './components/notification/notification.component';

@Component({
  selector: 'app-root',
  standalone: true,
   imports: [
    CommonModule,
    RouterOutlet,
    LoadingSpinnerComponent,
    NotificationComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('awnings-ireland');
}
