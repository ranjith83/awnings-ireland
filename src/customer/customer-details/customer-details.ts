import { Component, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CompanyDto, CompanyWithContactDto, Customer, CustomerMainViewDto, CustomerService, SalespersonDto } from '../../service/customer-service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { EmailTask, EmailTaskService } from '../../service/email-task.service';
import { AuditTrailService, AuditAction, AuditEntityType } from '../../service/audit-trail.service';

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
    siteAddress: '',
    salesperson: ''
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
          customer.siteAddress.toLowerCase().includes(filters.siteAddress.toLowerCase()) &&
          (customer.assignedSalesperson || '').toLowerCase().includes(filters.salesperson.toLowerCase())
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
  
  // Salesperson list - loaded from API
  salespeople: SalespersonDto[] = [];
  
  
  // Keep these for template two-way binding with ngModel
  searchFilters = {
    companyName: '',
    contact: '',
    mobile: '',
    email: '',
    siteAddress: '',
    salesperson: ''
  };

  // Store the current customer ID separately (not in the form)
  private currentCustomerId: number | null = null;
  linkedTaskId: any;

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private router: Router,
    private emailTaskService: EmailTaskService,
    private auditService: AuditTrailService,
    private route: ActivatedRoute,
  ) {
    this.customerForm = this.fb.group({
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
      assignedSalespersonId: [null],
      assignedSalespersonName: [''],
      contactFirstName: ['', Validators.required],
      contactLastName: ['', Validators.required],
      contactPhone: ['', Validators.required],
      contactEmail: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    this.loadCustomers();
    this.loadSalespeople();

     this.route.queryParams.subscribe(params => {
    if (params['taskId']) {
      this.openAddModalWithPrefilledData(params);
    }
  });
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

  loadSalespeople(): void {
    this.customerService.getSalespeople().pipe(
      tap(data => {
        this.salespeople = data;
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error loading salespeople:', error);
        // Don't show error to user, just log it
        this.salespeople = [];
      }
    });
  }

  openAddModal(): void {
    this.modalModeSubject.next('add');
    this.currentCustomerId = null;
    this.customerForm.reset({
      residential: false,
      assignedSalespersonId: null,
      assignedSalespersonName: ''
    });
    this.showModalSubject.next(true);
  }

  openEditModal(customer: CustomerMainViewDto): void {
    this.modalModeSubject.next('edit');
    this.isLoadingSubject.next(true);
    
    this.customerService.getCustomerById(customer.customerId).pipe(
      tap(fullCustomer => {
        const contact = fullCustomer.customerContacts?.[0];
        
        // Store the customer ID separately
        this.currentCustomerId = fullCustomer.customerId;
        
        // Reset form first to clear any previous values
        this.customerForm.reset();
        
        // Patch values with proper defaults for all required fields
        this.customerForm.patchValue({
          name: fullCustomer.name || '',
          companyNumber: fullCustomer.companyNumber || '',
          residential: fullCustomer.residential || false,
          taxNumber: fullCustomer.taxNumber || '',
          vatNumber: fullCustomer.vatNumber || '',
          address1: fullCustomer.address1 || '',
          address2: fullCustomer.address2 || '',
          address3: fullCustomer.address3 || '',
          county: fullCustomer.county || '',
          phone: fullCustomer.phone || '',
          mobile: fullCustomer.mobile || '',
          email: fullCustomer.email || '',
          eircode: fullCustomer.eircode || '',
          assignedSalespersonId: fullCustomer.assignedSalespersonId || null,
          assignedSalespersonName: fullCustomer.assignedSalespersonName || '',
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
    this.currentCustomerId = null;
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

    this.customerService.deleteCompany(customer.customerId).pipe(
      tap(() => {
        console.log('Customer deleted successfully');

        // ── Audit: DELETE ──────────────────────────────────────────────────
        this.auditService.createAuditLog({
          entityType:  AuditEntityType.CUSTOMER,
          entityId:    customer.customerId,
          entityName:  customer.companyName,
          action:      AuditAction.DELETE,
          changes:     [],
          performedBy: 0,
          notes:       `Customer '${customer.companyName}' deleted via Customer Details`
        }).subscribe({ error: e => console.warn('Audit log failed (non-critical):', e) });
        // ──────────────────────────────────────────────────────────────────

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

  onSalespersonChange(): void {
    const salespersonId = this.customerForm.get('assignedSalespersonId')?.value;
    const salesperson = this.salespeople.find(s => s.userId === Number(salespersonId));
    
    if (salesperson) {
      this.customerForm.patchValue({
        assignedSalespersonName: salesperson.name
      });
    } else if (salespersonId === null) {
      // When "-- Select Salesperson --" is chosen
      this.customerForm.patchValue({
        assignedSalespersonName: ''
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
      assignedSalespersonId: formValue.assignedSalespersonId,
      assignedSalespersonName: formValue.assignedSalespersonName,
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

        // ── Audit: CREATE ──────────────────────────────────────────────────
        this.auditService.createAuditLog({
          entityType:      AuditEntityType.CUSTOMER,
          entityId:        response.customerId,
          entityName:      newCustomer.name,
          action:          AuditAction.CREATE,
          changes:         [],
          performedBy:     0,   // resolved server-side via HttpContext
          notes:           this.linkedTaskId
                             ? `Customer created and linked to task #${this.linkedTaskId}`
                             : 'Customer created via Customer Details form'
        }).subscribe({ error: e => console.warn('Audit log failed (non-critical):', e) });
        // ──────────────────────────────────────────────────────────────────

        // If this was created from a task, link them
        if (this.linkedTaskId) {
          this.emailTaskService.linkCustomerToTask(this.linkedTaskId, response.customerId)
            .subscribe(() => {
              alert('Customer created and linked to task successfully');
              this.router.navigate(['/task']); // Go back to tasks
            });
        } else {
          alert('Customer added successfully');
        }
        
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

  openAddModalWithPrefilledData(params: any): void {
    this.modalModeSubject.next('add');
    this.currentCustomerId = null;
    this.customerForm.patchValue({
      email: params['email'] || '',
      contactFirstName: params['contactFirstName'] || '',
      contactLastName: params['contactLastName'] || '',
      name: params['companyName'] || '',
      residential: false,
      assignedSalespersonId: null
    });
    this.showModalSubject.next(true);
    
    // Store task ID to link after creation
    this.linkedTaskId = params['taskId'];
}

  private updateCustomer(): void {
    const formValue = this.customerForm.value;

    // Use the stored customer ID
    if (!this.currentCustomerId) {
      console.error('No customer ID found for update');
      this.errorMessageSubject.next('Failed to update customer. Customer ID not found.');
      this.isLoadingSubject.next(false);
      return;
    }

    const updateData: CompanyDto = {
      customerId: this.currentCustomerId,
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
      assignedSalespersonId: formValue.assignedSalespersonId,
      assignedSalespersonName: formValue.assignedSalespersonName,
      updatedBy: 1
    };

    this.customerService.updateCompany(this.currentCustomerId, updateData).pipe(
      tap(response => {
        console.log('Customer updated:', response);

        // ── Audit: UPDATE ──────────────────────────────────────────────────
        this.auditService.createAuditLog({
          entityType:  AuditEntityType.CUSTOMER,
          entityId:    this.currentCustomerId!,
          entityName:  updateData.name,
          action:      AuditAction.UPDATE,
          changes:     [],   // field-level diff not computed here; server-side diff covers it
          performedBy: 0,
          notes:       `Customer record updated via Customer Details form`
        }).subscribe({ error: e => console.warn('Audit log failed (non-critical):', e) });
        // ──────────────────────────────────────────────────────────────────

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
    this.searchFiltersSubject.next({ ...this.searchFilters });
  }

  navigateToWorkflow(customer: CustomerMainViewDto): void {
    this.router.navigate(['/workflow'], { 
      queryParams: { 
        customerId:    customer.customerId,
        customerName:  customer.companyName,
        customerEmail: customer.contactEmail   // ← pass email so Initial Enquiry can pre-populate it
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

  openCustomerCreationModal(task: EmailTask): void {
    this.emailTaskService.getExtractedCustomerData(task.taskId).subscribe({
      next: (data) => {
        // Navigate to customer details page with pre-filled data
        this.router.navigate(['/customers/new'], {
          queryParams: {
            taskId: task.taskId,
            email: data.email,
            contactFirstName: data.contactFirstName,
            contactLastName: data.contactLastName,
            companyName: data.customerName || data.fromName
          }
        });
      }
    });
  }
}