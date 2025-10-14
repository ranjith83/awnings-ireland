import { Component, OnInit } from '@angular/core';
import { Customer, CustomerSearchFilters } from '../../model/customer.model';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CustomerService } from '../../service/customer-service';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-customer-details',
  standalone: true,
  imports: [  CommonModule, FormsModule],
  templateUrl: './customer-details.html',
  styleUrl: './customer-details.css'
})
export class CustomerDetails {

 customers: Customer[] = [];
  filteredCustomers: Customer[] = [];
  isLoading = false;
  errorMessage = '';
  
  searchFilters: CustomerSearchFilters = {
    companyName: '',
    contact: '',
    mobile: '',
    email: '',
    siteAddress: ''
  };

  private searchSubject = new Subject<CustomerSearchFilters>();
  private destroy$ = new Subject<void>();

  constructor(private customerService: CustomerService) {}

  ngOnInit() {
    this.loadCustomers();
    this.setupSearchDebounce();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Load all customers from API
  loadCustomers() {
    this.isLoading = true;
    this.errorMessage = '';
    
    this.customerService.getCustomers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (customers) => {
          this.customers = customers;
          this.filteredCustomers = customers;
          this.isLoading = false;
        },
        error: (error) => {
          this.errorMessage = error.message;
          this.isLoading = false;
          console.error('Error loading customers:', error);
        }
      });
  }

  // Setup debounced search for API calls
  setupSearchDebounce() {
    this.searchSubject
      .pipe(
        debounceTime(300), // Wait 300ms after user stops typing
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        takeUntil(this.destroy$)
      )
      .subscribe(filters => {
        this.searchCustomersAPI(filters);
      });
  }

  // Trigger search (called on input change)
  applyFilters() {
    // Option 1: Client-side filtering (fast, no API call)
    this.filterCustomersLocally();
    
    // Option 2: Server-side filtering (uncomment to use API search)
    // this.searchSubject.next(this.searchFilters);
  }

  // Client-side filtering
  private filterCustomersLocally() {
    this.filteredCustomers = this.customers.filter(customer => {
      return (
        customer.companyName.toLowerCase().includes(this.searchFilters.companyName.toLowerCase()) &&
        customer.contact.toLowerCase().includes(this.searchFilters.contact.toLowerCase()) &&
        customer.mobile.includes(this.searchFilters.mobile) &&
        customer.email.toLowerCase().includes(this.searchFilters.email.toLowerCase()) &&
        customer.siteAddress.toLowerCase().includes(this.searchFilters.siteAddress.toLowerCase())
      );
    });
  }

  // Server-side filtering via API
  private searchCustomersAPI(filters: CustomerSearchFilters) {
    // Check if all filters are empty
    const hasFilters = Object.values(filters).some(value => value.trim() !== '');
    
    if (!hasFilters) {
      this.filteredCustomers = this.customers;
      return;
    }

    this.isLoading = true;
    
    this.customerService.searchCustomersQuery(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (customers) => {
          this.filteredCustomers = customers;
          this.isLoading = false;
        },
        error: (error) => {
          this.errorMessage = error.message;
          this.isLoading = false;
          console.error('Error searching customers:', error);
        }
      });
  }

  // Refresh customer list
  refresh() {
    this.loadCustomers();
  }

  // Clear all filters
  clearFilters() {
    this.searchFilters = {
      companyName: '',
      contact: '',
      mobile: '',
      email: '',
      siteAddress: ''
    };
    this.filteredCustomers = this.customers;
  }
}
