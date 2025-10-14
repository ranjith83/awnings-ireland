import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CustomerDetails } from "../customer/customer-details/customer-details";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CustomerDetails],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('awnings-ireland');
}
