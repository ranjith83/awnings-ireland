import { Component, OnInit } from '@angular/core';
import { Customer, CustomerSearchFilters } from '../../model/customer.model';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CustomerService } from '../../service/customer-service';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-customer-details',
  standalone: true,
  imports: [  CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './customer-details.html',
  styleUrl: './customer-details.css'
})
export class CustomerDetails {

  customers: Customer[] = [];
  filteredCustomers: Customer[] = [];
  
  showModal = false;
  modalMode: 'add' | 'edit' = 'add';
  customerForm: FormGroup;
  
  searchFilters = {
    companyName: '',
    contact: '',
    mobile: '',
    email: '',
    siteAddress: ''
  };

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private router: Router
  ) {
    this.customerForm = this.fb.group({
      id: [null],
      companyName: ['', [Validators.required, Validators.minLength(2)]],
      contact: ['', [Validators.required, Validators.minLength(2)]],
      mobile: ['', [Validators.required, Validators.pattern(/^\d{9,10}$/)]],
      email: ['', [Validators.required, Validators.email]],
      siteAddress: ['', [Validators.required, Validators.minLength(5)]]
    });
  }

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    this.customerService.getCustomers().subscribe({
      next: (data) => {
        this.customers = data;
        this.filteredCustomers = [...this.customers];
      },
      error: (error) => {
        console.error('Error loading customers:', error);
        alert('Failed to load customers');
      }
    });
  }

  openAddModal(): void {
    this.modalMode = 'add';
    this.customerForm.reset();
    this.showModal = true;
  }

  openEditModal(customer: Customer): void {
    this.modalMode = 'edit';
    this.customerForm.patchValue(customer);
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.customerForm.reset();
  }

  onSubmit(): void {
    if (this.customerForm.invalid) {
      Object.keys(this.customerForm.controls).forEach(key => {
        this.customerForm.controls[key].markAsTouched();
      });
      return;
    }

    const customerData: Customer = this.customerForm.value;

    if (this.modalMode === 'add') {
      this.customerService.addCustomer(customerData).subscribe({
        next: (response) => {
          alert('Customer added successfully');
          this.loadCustomers();
          this.closeModal();
        },
        error: (error) => {
          console.error('Error adding customer:', error);
          alert('Failed to add customer');
        }
      });
    } else {
      this.customerService.updateCustomer(customerData.id!, customerData).subscribe({
        next: (response) => {
          alert('Customer updated successfully');
          this.loadCustomers();
          this.closeModal();
        },
        error: (error) => {
          console.error('Error updating customer:', error);
          alert('Failed to update customer');
        }
      });
    }
  }

  onSearchChange(): void {
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

  getError(fieldName: string): string {
    const control = this.customerForm.get(fieldName);
    if (control?.touched && control?.errors) {
      if (control.errors['required']) {
        return `${this.getFieldLabel(fieldName)} is required`;
      }
      if (control.errors['email']) {
        return 'Please enter a valid email';
      }
      if (control.errors['pattern']) {
        return 'Mobile must be 9-10 digits';
      }
      if (control.errors['minLength']) {
        return `${this.getFieldLabel(fieldName)} is too short`;
      }
    }
    return '';
  }

  getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      companyName: 'Company Name',
      contact: 'Contact',
      mobile: 'Mobile',
      email: 'Email',
      siteAddress: 'Site Address'
    };
    return labels[fieldName] || fieldName;
  }

  navigateToWorkflow(customer: Customer): void {
    // Navigate to workflow screen with customer ID
    this.router.navigate(['/workflow'], { 
      queryParams: { 
        customerId: customer.id,
        customerName: customer.companyName 
      } 
    });
  }
}