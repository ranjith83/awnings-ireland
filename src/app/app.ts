import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CustomerDetails } from "../customer/customer-details/customer-details";
import { CreateQuoteComponent } from "../workflow/create-quote.component/create-quote.component";
import { WorkflowComponent } from "../workflow.component/workflow.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('awnings-ireland');
}
