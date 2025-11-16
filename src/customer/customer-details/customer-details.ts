import { Component, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CompanyDto, CompanyWithContactDto, Customer, CustomerMainViewDto, CustomerService } from '../../service/customer-service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';

@Component({
  selector: 'app-customer-details',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './customer-details.html',
  styleUrl: './customer-details.css'
})
export class CustomerDetails implements OnInit {

  // Observable state management
  private customersSubject = new BehaviorSubject<CustomerMainViewDto[]>([]);
  customers$ = this.customersSubject.asObservable();
  
  private searchFiltersSubject = new BehaviorSubject({
    companyName: '',
    contact: '',
    mobile: '',
    email: '',
    siteAddress: ''
  });
  searchFilters$ = this.searchFiltersSubject.asObservable();
  
  // Computed filtered customers
  filteredCustomers$: Observable<CustomerMainViewDto[]> = combineLatest([
    this.customers$,
    this.searchFilters$
  ]).pipe(
    map(([customers, filters]) => {
      return customers.filter(customer => {
        return (
          customer.companyName.toLowerCase().includes(filters.companyName.toLowerCase()) &&
          customer.contactName.toLowerCase().includes(filters.contact.toLowerCase()) &&
          (customer.mobilePhone || '').includes(filters.mobile) &&
          customer.contactEmail.toLowerCase().includes(filters.email.toLowerCase()) &&
          customer.siteAddress.toLowerCase().includes(filters.siteAddress.toLowerCase())
        );
      });
    }),
    shareReplay(1)
  );
  
  private showModalSubject = new BehaviorSubject(false);
  showModal$ = this.showModalSubject.asObservable();
  
  private showDeleteModalSubject = new BehaviorSubject(false);
  showDeleteModal$ = this.showDeleteModalSubject.asObservable();
  
  private modalModeSubject = new BehaviorSubject<'add' | 'edit'>('add');
  modalMode$ = this.modalModeSubject.asObservable();
  
  private customerToDeleteSubject = new BehaviorSubject<CustomerMainViewDto | null>(null);
  customerToDelete$ = this.customerToDeleteSubject.asObservable();
  
  private isLoadingSubject = new BehaviorSubject(false);
  isLoading$ = this.isLoadingSubject.asObservable();
  
  private errorMessageSubject = new BehaviorSubject('');
  errorMessage$ = this.errorMessageSubject.asObservable();
  
  customerForm: FormGroup;
  
  // Keep these for template two-way binding with ngModel
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
      companyId: [null],
      name: ['', [Validators.required, Validators.minLength(2)]],
      companyNumber: [''],
      residential: [false],
      taxNumber: [''],
      vatNumber: [''],
      address1: ['', Validators.required],
      address2: [''],
      address3: [''],
      county: [''],
      phone: [''],
      mobile: ['', [Validators.required, Validators.pattern(/^\d{9,10}$/)]],
      email: ['', [Validators.required, Validators.email]],
      eircode: [''],
      contactFirstName: ['', Validators.required],
      contactLastName: ['', Validators.required],
      contactPhone: ['', Validators.required],
      contactEmail: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    this.loadCustomers();
  }

  loadCustomers(): void {
    this.isLoadingSubject.next(true);
    this.errorMessageSubject.next('');
    
    this.customerService.getAllCustomers().pipe(
      tap(data => {
        this.customersSubject.next(data);
        this.isLoadingSubject.next(false);
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error loading customers:', error);
        this.errorMessageSubject.next('Failed to load customers. Please try again.');
        this.isLoadingSubject.next(false);
      }
    });
  }

  openAddModal(): void {
    this.modalModeSubject.next('add');
    this.customerForm.reset({
      residential: false
    });
    this.showModalSubject.next(true);
  }

  openEditModal(customer: CustomerMainViewDto): void {
    this.modalModeSubject.next('edit');
    this.isLoadingSubject.next(true);
    
    this.customerService.getCustomerById(customer.companyId).pipe(
      tap(fullCustomer => {
        const contact = fullCustomer.customerContacts?.[0];
        
        this.customerForm.patchValue({
          companyId: fullCustomer.companyId,
          name: fullCustomer.name,
          companyNumber: fullCustomer.companyNumber,
          residential: fullCustomer.residential,
          taxNumber: fullCustomer.taxNumber || '',
          vatNumber: fullCustomer.vatNumber || '',
          address1: fullCustomer.address1,
          address2: fullCustomer.address2,
          address3: fullCustomer.address3,
          county: fullCustomer.county,
          phone: fullCustomer.phone,
          mobile: fullCustomer.mobile,
          email: fullCustomer.email,
          eircode: fullCustomer.eircode,
          contactFirstName: contact?.firstName || '',
          contactLastName: contact?.lastName || '',
          contactPhone: contact?.phone || '',
          contactEmail: contact?.email || ''
        });
        
        this.isLoadingSubject.next(false);
        this.showModalSubject.next(true);
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error loading customer details:', error);
        this.errorMessageSubject.next('Failed to load customer details');
        this.isLoadingSubject.next(false);
      }
    });
  }

  openDeleteModal(customer: CustomerMainViewDto): void {
    this.customerToDeleteSubject.next(customer);
    this.showDeleteModalSubject.next(true);
  }

  closeModal(): void {
    this.showModalSubject.next(false);
    this.customerForm.reset();
    this.errorMessageSubject.next('');
  }

  closeDeleteModal(): void {
    this.showDeleteModalSubject.next(false);
    this.customerToDeleteSubject.next(null);
  }

  confirmDelete(): void {
    const customer = this.customerToDeleteSubject.value;
    if (!customer) return;

    this.isLoadingSubject.next(true);
    this.errorMessageSubject.next('');

    this.customerService.deleteCompany(customer.companyId).pipe(
      tap(() => {
        console.log('Customer deleted successfully');
        alert('Customer deleted successfully');
        this.loadCustomers();
        this.closeDeleteModal();
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error deleting customer:', error);
        this.errorMessageSubject.next('Failed to delete customer. Please try again.');
        this.isLoadingSubject.next(false);
      }
    });
  }

  onResidentialChange(): void {
    const isResidential = this.customerForm.get('residential')?.value;
    
    if (isResidential) {
      this.customerForm.patchValue({
        taxNumber: '',
        vatNumber: ''
      });
    }
  }

  onSubmit(): void {
    if (this.customerForm.invalid) {
      Object.keys(this.customerForm.controls).forEach(key => {
        this.customerForm.controls[key].markAsTouched();
      });
      return;
    }

    this.isLoadingSubject.next(true);
    this.errorMessageSubject.next('');

    if (this.modalModeSubject.value === 'add') {
      this.addCustomer();
    } else {
      this.updateCustomer();
    }
  }

  private addCustomer(): void {
    const formValue = this.customerForm.value;
    
    const newCustomer: CompanyWithContactDto = {
      name: formValue.name,
      companyNumber: formValue.companyNumber,
      residential: formValue.residential,
      taxNumber: formValue.residential ? null : formValue.taxNumber,
      vatNumber: formValue.residential ? null : formValue.vatNumber,
      address1: formValue.address1,
      address2: formValue.address2,
      address3: formValue.address3,
      county: formValue.county,
      phone: formValue.phone,
      mobile: formValue.mobile,
      email: formValue.email,
      eircode: formValue.eircode,
      contacts: [{
        firstName: formValue.contactFirstName,
        lastName: formValue.contactLastName,
        phone: formValue.contactPhone,
        email: formValue.contactEmail
      }]
    };

    this.customerService.addCompanyWithContact(newCustomer).pipe(
      tap(response => {
        console.log('Customer added:', response);
        alert('Customer added successfully');
        this.loadCustomers();
        this.closeModal();
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error adding customer:', error);
        this.errorMessageSubject.next('Failed to add customer. Please try again.');
        this.isLoadingSubject.next(false);
      }
    });
  }

  private updateCustomer(): void {
    const formValue = this.customerForm.value;
    const companyId = formValue.companyId;

    const updateData: CompanyDto = {
      companyId: companyId,
      name: formValue.name,
      companyNumber: formValue.companyNumber,
      residential: formValue.residential,
      taxNumber: formValue.residential ? null : formValue.taxNumber,
      vatNumber: formValue.residential ? null : formValue.vatNumber,
      address1: formValue.address1,
      address2: formValue.address2,
      address3: formValue.address3,
      county: formValue.county,
      phone: formValue.phone,
      mobile: formValue.mobile,
      email: formValue.email,
      eircode: formValue.eircode,
      updatedBy: 1
    };

    this.customerService.updateCompany(companyId, updateData).pipe(
      tap(response => {
        console.log('Customer updated:', response);
        alert('Customer updated successfully');
        this.loadCustomers();
        this.closeModal();
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error updating customer:', error);
        this.errorMessageSubject.next('Failed to update customer. Please try again.');
        this.isLoadingSubject.next(false);
      }
    });
  }

  onSearchChange(): void {
    // Update the BehaviorSubject with current filter values
    this.searchFiltersSubject.next({ ...this.searchFilters });
  }

  navigateToWorkflow(customer: CustomerMainViewDto): void {
    this.router.navigate(['/workflow'], { 
      queryParams: { 
        customerId: customer.companyId,
        customerName: customer.companyName 
      } 
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
      if (control.errors['minlength']) {
        return `${this.getFieldLabel(fieldName)} is too short`;
      }
    }
    return '';
  }

  getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      name: 'Company Name',
      companyNumber: 'Company Number',
      address1: 'Address Line 1',
      mobile: 'Mobile',
      email: 'Email',
      contactFirstName: 'Contact First Name',
      contactLastName: 'Contact Last Name',
      contactPhone: 'Contact Phone',
      contactEmail: 'Contact Email'
    };
    return labels[fieldName] || fieldName;
  }
}