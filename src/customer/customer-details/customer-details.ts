import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CompanyDto, CompanyWithContactDto, CustomerMainViewDto, CustomerService, SalespersonDto } from '../../service/customer-service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { EmailTask, EmailTaskService } from '../../service/email-task.service';
import { AuditTrailService, AuditAction, AuditEntityType } from '../../service/audit-trail.service';

import { NotificationService } from '../../service/notification.service';
@Component({
  selector: 'app-customer-details',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './customer-details.html',
  styleUrl: './customer-details.css'
})
export class CustomerDetails implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  readonly irishCounties = [
    'Carlow','Cavan','Clare','Cork','Donegal','Dublin','Galway','Kerry',
    'Kildare','Kilkenny','Laois','Leitrim','Limerick','Longford','Louth',
    'Mayo','Meath','Monaghan','Offaly','Roscommon','Sligo','Tipperary',
    'Waterford','Westmeath','Wexford','Wicklow'
  ];

  readonly countries = [
    { id: 1, name: 'Ireland' },
    { id: 2, name: 'United Kingdom' },
    { id: 3, name: 'France' },
    { id: 4, name: 'Germany' },
    { id: 5, name: 'Spain' },
    { id: 6, name: 'Italy' },
    { id: 7, name: 'Other' }
  ];

  addNewContact = false;
  eircodeLoading = false;
  eircodeError = '';

  // Observable state management
  private customersSubject = new BehaviorSubject<CustomerMainViewDto[]>([]);
  customers$ = this.customersSubject.asObservable();
  
  private searchFiltersSubject = new BehaviorSubject({
    companyName: '',
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
    mobile: '',
    email: '',
    siteAddress: '',
    salesperson: ''
  };

  // Store the current customer ID separately (not in the form)
  private currentCustomerId: number | null = null;
  private currentContactId: number | null = null;
  linkedTaskId: any;

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private router: Router,
    private emailTaskService: EmailTaskService,
    private auditService: AuditTrailService,
    private route: ActivatedRoute,
    private notificationService: NotificationService) {
    this.customerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      companyNumber: [''],
      residential: [false],
      commercial: [false],
      taxNumber: [''],
      vatNumber: [''],
      eircode: [''],
      address1: ['', Validators.required],
      address2: [''],
      address3: [''],
      county: ['Dublin'],
      countryId: [1],
      phone: [''],
      mobile: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      assignedSalespersonId: [null],
      assignedSalespersonName: [''],
      contactFirstName: [''],
      contactLastName: [''],
      contactPhone: [''],
      contactEmail: ['', Validators.email]
    }, {
      validators: (group) => {
        const res = group.get('residential')?.value;
        const com = group.get('commercial')?.value;
        return (res || com) ? null : { typeRequired: true };
      }
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  matchCounty(county: string | null | undefined): string {
    if (!county) return '';
    const clean = county.replace(/^County\s+/i, '').trim().toLowerCase();
    return this.irishCounties.find(c => c.toLowerCase() === clean) || '';
  }

  findAddress(): void {
    const code = (this.customerForm.value.eircode || '').trim().replace(/\s+/g, '');
    if (!code) return;
    this.eircodeLoading = true;
    this.eircodeError = '';
    this.customerService.lookupEircode(code).subscribe({
      next: addr => {
        this.eircodeLoading = false;
        if (!addr) { this.eircodeError = 'No address found'; return; }
        const matchedCounty = this.matchCounty(addr.county);
        this.customerForm.patchValue({
          address1: addr.address1 || '',
          address2: addr.address2 || '',
          address3: addr.address3 || '',
          county:   matchedCounty || this.customerForm.value.county
        });
      },
      error: () => {
        this.eircodeLoading = false;
        this.eircodeError = 'Could not find address for this EirCode';
      }
    });
  }

  loadCustomers(): void {
    this.isLoadingSubject.next(true);

    
    this.customerService.getAllCustomers().pipe(
      tap(data => {
        this.customersSubject.next(data);
        this.isLoadingSubject.next(false);
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error loading customers:', error);
        this.notificationService.error('Failed to load customers. Please try again.');
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
    this.addNewContact = false;
    this.customerForm.reset({
      residential: false,
      commercial: false,
      county: 'Dublin',
      countryId: 1,
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

        this.currentCustomerId = fullCustomer.customerId;
        this.currentContactId = contact?.contactId ?? null;
        this.addNewContact = !!contact;

        this.customerForm.reset();

        this.customerForm.patchValue({
          name: fullCustomer.name || '',
          companyNumber: fullCustomer.companyNumber || '',
          residential: fullCustomer.residential === true,
          commercial: fullCustomer.residential === false,
          taxNumber: fullCustomer.taxNumber || '',
          vatNumber: fullCustomer.vatNumber || '',
          address1: fullCustomer.address1 || '',
          address2: fullCustomer.address2 || '',
          address3: fullCustomer.address3 || '',
          county: fullCustomer.county || 'Dublin',
          countryId: fullCustomer.countryId || 1,
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

        // set validators for contact fields based on whether a contact exists
        this.onAddNewContactChange();

        this.isLoadingSubject.next(false);
        this.showModalSubject.next(true);
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error loading customer details:', error);
        this.notificationService.error('Failed to load customer details');
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
    this.currentContactId = null;
    this.addNewContact = false;
    this.eircodeError = '';
    this.customerForm.reset();

  }

  closeDeleteModal(): void {
    this.showDeleteModalSubject.next(false);
    this.customerToDeleteSubject.next(null);
  }

  confirmDelete(): void {
    const customer = this.customerToDeleteSubject.value;
    if (!customer) return;

    this.isLoadingSubject.next(true);


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

        this.notificationService.success(`Customer deleted successfully`);
        this.loadCustomers();
        this.closeDeleteModal();
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error deleting customer:', error);
        this.notificationService.error('Failed to delete customer. Please try again.');
        this.isLoadingSubject.next(false);
      }
    });
  }

  onResidentialChange(): void {
    if (this.customerForm.get('residential')?.value) {
      this.customerForm.patchValue({ commercial: false, taxNumber: '', vatNumber: '' });
    }
    this.customerForm.updateValueAndValidity();
  }

  onCommercialChange(): void {
    if (this.customerForm.get('commercial')?.value) {
      this.customerForm.patchValue({ residential: false });
    }
    this.customerForm.updateValueAndValidity();
  }

  onAddNewContactChange(): void {
    const contactFields = ['contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail'];
    if (this.addNewContact) {
      contactFields.forEach(field => {
        const ctrl = this.customerForm.get(field)!;
        const validators = field === 'contactEmail'
          ? [Validators.required, Validators.email]
          : [Validators.required];
        ctrl.setValidators(validators);
        ctrl.updateValueAndValidity();
      });
    } else {
      contactFields.forEach(field => {
        const ctrl = this.customerForm.get(field)!;
        const validators = field === 'contactEmail' ? [Validators.email] : [];
        ctrl.setValidators(validators);
        ctrl.markAsUntouched();
        ctrl.updateValueAndValidity();
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
    this.customerForm.markAllAsTouched();
    if (this.customerForm.invalid) {
      return;
    }

    this.isLoadingSubject.next(true);


    if (this.modalModeSubject.value === 'add') {
      this.addCustomer();
    } else {
      this.updateCustomer();
    }
  }

  private addCustomer(): void {
    const formValue = this.customerForm.getRawValue();
    
    const isResidential = formValue.residential || false;
    const newCustomer: CompanyWithContactDto = {
      name: formValue.name,
      companyNumber: formValue.companyNumber,
      residential: isResidential,
      taxNumber: isResidential ? null : formValue.taxNumber,
      vatNumber: isResidential ? null : formValue.vatNumber,
      address1: formValue.address1,
      address2: formValue.address2,
      address3: formValue.address3,
      county: formValue.county,
      countryId: formValue.countryId,
      phone: formValue.phone,
      mobile: formValue.mobile,
      email: formValue.email,
      eircode: formValue.eircode,
      assignedSalespersonId: formValue.assignedSalespersonId,
      assignedSalespersonName: formValue.assignedSalespersonName,
      contacts: this.addNewContact ? [{
        firstName: formValue.contactFirstName,
        lastName: formValue.contactLastName,
        phone: formValue.contactPhone,
        email: formValue.contactEmail
      }] : []
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
              this.notificationService.success(`Customer created and linked to task successfully`);
              this.router.navigate(['/task']); // Go back to tasks
            });
        } else {
          this.notificationService.success(`Customer added successfully`);
        }
        
        this.loadCustomers();
        this.closeModal();
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error adding customer:', error);
        this.notificationService.error('Failed to add customer. Please try again.');
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
    const formValue = this.customerForm.getRawValue();

    // Use the stored customer ID
    if (!this.currentCustomerId) {
      console.error('No customer ID found for update');
      this.notificationService.error('Failed to update customer. Customer ID not found.');
      this.isLoadingSubject.next(false);
      return;
    }

    const isResidential = formValue.residential || false;
    const updateData: CompanyDto = {
      customerId: this.currentCustomerId,
      name: formValue.name,
      companyNumber: formValue.companyNumber,
      residential: isResidential,
      taxNumber: isResidential ? null : formValue.taxNumber,
      vatNumber: isResidential ? null : formValue.vatNumber,
      address1: formValue.address1,
      address2: formValue.address2,
      address3: formValue.address3,
      county: formValue.county,
      countryId: formValue.countryId,
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

        if (this.addNewContact) {
          const contactData = {
            customerID: this.currentCustomerId!,
            firstName: formValue.contactFirstName,
            lastName: formValue.contactLastName,
            phone: formValue.contactPhone,
            email: formValue.contactEmail
          };
          const contactCall = this.currentContactId
            ? this.customerService.updateContact(this.currentContactId, contactData)
            : this.customerService.addContactToCompany(contactData) as any;
          (contactCall as any).subscribe({ error: (e: any) => console.warn('Contact update failed:', e) });
        }

        this.auditService.createAuditLog({
          entityType:  AuditEntityType.CUSTOMER,
          entityId:    this.currentCustomerId!,
          entityName:  updateData.name,
          action:      AuditAction.UPDATE,
          changes:     [],
          performedBy: 0,
          notes:       `Customer record updated via Customer Details form`
        }).subscribe({ error: e => console.warn('Audit log failed (non-critical):', e) });

        this.notificationService.success(`Customer updated successfully`);
        this.loadCustomers();
        this.closeModal();
      })
    ).subscribe({
      error: (error: Error) => {
        console.error('Error updating customer:', error);
        this.notificationService.error('Failed to update customer. Please try again.');
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
      name: 'Contact Name',
      companyNumber: 'Company Number',
      eircode: 'EirCode',
      address1: 'Address Line 1',
      mobile: 'Mobile',
      email: 'Email',
      contactFirstName: 'First Name',
      contactLastName: 'Last Name',
      contactPhone: 'Phone',
      contactEmail: 'Email'
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