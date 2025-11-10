import { Component, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CompanyDto, CompanyWithContactDto, Customer, CustomerMainViewDto, CustomerService } from '../../service/customer-service';
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

 customers: CustomerMainViewDto[] = [];
  filteredCustomers: CustomerMainViewDto[] = [];
  
  showModal = false;
  modalMode: 'add' | 'edit' = 'add';
  customerForm: FormGroup;
  
  isLoading = false;
  errorMessage = '';
  
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
    this.isLoading = true;
    this.errorMessage = '';
    
    this.customerService.getAllCustomers().subscribe({
      next: (data: CustomerMainViewDto[]) => {
        this.customers = data;
        this.filteredCustomers = [...this.customers];
        this.isLoading = false;
      },
      error: (error: Error) => {
        console.error('Error loading customers:', error);
        this.errorMessage = 'Failed to load customers. Please try again.';
        this.isLoading = false;
      }
    });
  }

  openAddModal(): void {
    this.modalMode = 'add';
    this.customerForm.reset({
      residential: false
    });
    this.showModal = true;
  }

  openEditModal(customer: CustomerMainViewDto): void {
    this.modalMode = 'edit';
    
    // Load full customer details
    this.isLoading = true;
    this.customerService.getCustomerById(customer.companyId).subscribe({
      next: (fullCustomer: Customer) => {
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
        
        this.isLoading = false;
        this.showModal = true;
      },
      error: (error: Error) => {
        console.error('Error loading customer details:', error);
        this.errorMessage = 'Failed to load customer details';
        this.isLoading = false;
      }
    });
  }

  closeModal(): void {
    this.showModal = false;
    this.customerForm.reset();
    this.errorMessage = '';
  }

  onResidentialChange(): void {
    const isResidential = this.customerForm.get('residential')?.value;
    
    // Clear tax and VAT fields when switching to residential
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

    this.isLoading = true;
    this.errorMessage = '';

    if (this.modalMode === 'add') {
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

    this.customerService.addCompanyWithContact(newCustomer).subscribe({
      next: (response: Customer) => {
        console.log('Customer added:', response);
        alert('Customer added successfully');
        this.loadCustomers();
        this.closeModal();
      },
      error: (error: Error) => {
        console.error('Error adding customer:', error);
        this.errorMessage = 'Failed to add customer. Please try again.';
        this.isLoading = false;
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
      updatedBy: 1 // Replace with actual user ID from auth service
    };

    this.customerService.updateCompany(companyId, updateData).subscribe({
      next: (response: Customer) => {
        console.log('Customer updated:', response);
        alert('Customer updated successfully');
        this.loadCustomers();
        this.closeModal();
      },
      error: (error: Error) => {
        console.error('Error updating customer:', error);
        this.errorMessage = 'Failed to update customer. Please try again.';
        this.isLoading = false;
      }
    });
  }

  onSearchChange(): void {
    this.filteredCustomers = this.customers.filter(customer => {
      return (
        customer.companyName.toLowerCase().includes(this.searchFilters.companyName.toLowerCase()) &&
        customer.contactName.toLowerCase().includes(this.searchFilters.contact.toLowerCase()) &&
        (customer.mobilePhone || '').includes(this.searchFilters.mobile) &&
        customer.contactEmail.toLowerCase().includes(this.searchFilters.email.toLowerCase()) &&
        customer.siteAddress.toLowerCase().includes(this.searchFilters.siteAddress.toLowerCase())
      );
    });
  }

  navigateToWorkflow(customer: CustomerMainViewDto): void {
    // Navigate to workflow screen with customer ID
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
      if (control.errors['minLength']) {
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