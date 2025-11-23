import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { takeUntil, tap, catchError, finalize } from 'rxjs/operators';
import { SelectedWorkflow, WorkflowStateService } from '../../service/workflow-state.service';
import { InitialEnquiryDto, WorkflowService } from '../../service/workflow.service';
import { Customer, CustomerService } from '../../service/customer-service';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

@Component({
  selector: 'app-initial-enquiry',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './initial-enquiry.component.html',
  styleUrl: './initial-enquiry.component.css'
})
export class InitialEnquiryComponent implements OnInit, OnDestroy {
  @Input() workflowId!: number;
  
  // Forms
  enquiryForm: FormGroup;
  emailForm: FormGroup;
  
  // Observables - BehaviorSubjects for state management
  enquiries$ = new BehaviorSubject<InitialEnquiryDto[]>([]);
  isLoading$ = new BehaviorSubject<boolean>(false);
  isEditMode$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  
  // Tab and email state
  activeTab$ = new BehaviorSubject<'comments' | 'email' | 'images'>('comments');
  emailContent$ = new BehaviorSubject<string>('');
  emailSubject$ = new BehaviorSubject<string>('');
  emailTemplates$ = new BehaviorSubject<EmailTemplate[]>([]);
  
  // Customer info
  customerName$ = new BehaviorSubject<string>('');
  customerId$ = new BehaviorSubject<number | null>(null);
  contactName$ = new BehaviorSubject<string>('');
  
  // Component state
  selectedEnquiryId?: number;
  selectedWorkflow: SelectedWorkflow | null = null;
  loggedInUserName: string = 'Michael';
  
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService,
    private customerService: CustomerService,
    private route: ActivatedRoute
  ) {
    // Initialize forms
    this.enquiryForm = this.fb.group({
      comments: ['', [Validators.required, Validators.minLength(10)]],
      email: ['', [Validators.required, Validators.email]],
      images: ['']
    });

    this.emailForm = this.fb.group({
      template: [''],
      subject: [''],
      body: ['']
    });
  }

  ngOnInit(): void {
    console.log('🔄 Initial Enquiry Component Initialized');
    
    // Get customer info from route params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const customerId = params['customerId'] ? +params['customerId'] : null;
        const customerName = params['customerName'] || '';
        
        this.customerId$.next(customerId);
        this.customerName$.next(customerName);
        
        if (customerId) {
          this.loadCustomerContact(customerId);
        } else {
          this.initializeEmailTemplates();
        }
      });

    // Subscribe to selected workflow
    this.workflowStateService.selectedWorkflow$
      .pipe(takeUntil(this.destroy$))
      .subscribe(workflow => {
        this.selectedWorkflow = workflow;
        
        if (workflow?.customerId && !this.contactName$.value) {
          this.customerId$.next(workflow.customerId);
          this.loadCustomerContact(workflow.customerId);
        }
        
        if (workflow?.id) {
          this.loadEnquiries(workflow.id);
        }
        
        console.log('Selected workflow:', workflow);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCustomerContact(customerId: number): void {
    console.log('🔄 Loading customer contact for ID:', customerId);
    
    this.customerService.getCustomerById(customerId)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          console.error('❌ Error loading customer contact:', error);
          this.contactName$.next(this.customerName$.value || '[Insert Name]');
          this.initializeEmailTemplates();
          return of(null);
        })
      )
      .subscribe(fullCustomer => {
        if (fullCustomer) {
          const contact = fullCustomer.customerContacts?.[0];
          const contactName = contact?.firstName || contact?.lastName
            ? `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim()
            : this.customerName$.value || '[Insert Name]';
          
          this.contactName$.next(contactName);
        }
        this.initializeEmailTemplates();
      });
  }

  private initializeEmailTemplates(): void {
    const displayName = this.contactName$.value || this.customerName$.value || '[Insert Name]';
    
    const templates: EmailTemplate[] = [
      {
        id: 'template-enquiry',
        name: 'Template-Enquiry',
        subject: 'Thank You for Your Enquiry',
        body: `Hi ${displayName},

Thank you for reaching out to us.

A member of our sales team will be in touch with you shortly. In the meantime, if you haven't already, please send us a photo of the area along with approximate measurements. This will help us provide you with an initial estimate.

Should you wish to proceed, we'll arrange a site survey, after which a detailed quote will follow.

Kindest regards,
${this.loggedInUserName}

Awnings of Ireland
Markilux awnings, Retractable roof systems, Giant umbrellas, Cafe screens, Outdoor heaters & outdoor flooring for business or leisure.
Tel: +353 (0) 1 652 3014
www.awningsofireland.com`
      },
      {
        id: 'template-quote',
        name: 'Template-Quote',
        subject: 'Your Quote from Awnings of Ireland',
        body: `Dear ${displayName},

Thank you for your enquiry.

Please find your quote [Insert Quote Number] for [Insert Value] attached.

You can also view your quote online here: [Insert Link]
From the online portal, you'll be able to accept, decline, comment, or print your quote at your convenience.

If you have any queries, please do not hesitate to contact me.

Kindest regards,
${this.loggedInUserName}

Awnings of Ireland
Markilux awnings, Retractable roof systems, Giant umbrellas, Cafe screens, Outdoor heaters & outdoor flooring for business or leisure.`
      },
      {
        id: 'template-renson-inquiry',
        name: 'Template-Renson-Inquiry',
        subject: 'Renson Enquiry – Brochure & Showroom Visit',
        body: `Dear ${displayName},

We received your enquiry via Renson, who kindly passed along your details to us as their official ambassadors in Ireland.
Unfortunately, we weren't able to reach you by phone as no contact number was provided.

Please find our brochure attached for your review. If you have any questions or would like to arrange a visit to our showroom, we'd be delighted to assist you.

Kind regards,
${this.loggedInUserName}

Awnings of Ireland`
      },
      {
        id: 'template-checkin',
        name: 'Template-CheckIn',
        subject: 'Quick Check-In on Your Project',
        body: `Hi ${displayName},

Just wanted to check in and see if your project is still moving forward. If it's no longer active, a quick heads-up would be really appreciated.

If I don't hear back, I'll plan to follow up again next week.

All the best,
${this.loggedInUserName}

Awnings of Ireland`
      },
      {
        id: 'template-followup-renson',
        name: 'Template-FollowUp-Renson',
        subject: 'Follow-Up on Renson Camargue Quotes',
        body: `Hi ${displayName},

I hope you're keeping well. I just wanted to follow up on the quotes I sent over on [insert date].

If you have any questions or need further details, please don't hesitate to get in touch – I'm happy to help.

If you're interested, you're very welcome to visit our showroom in Sandyford to see the Renson Camargue in person.

Looking forward to hearing from you.

Best regards,
${this.loggedInUserName}

Awnings of Ireland`
      }
    ];
    
    this.emailTemplates$.next(templates);
  }

  switchTab(tab: 'comments' | 'email' | 'images'): void {
    this.activeTab$.next(tab);
  }

  onTemplateSelect(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const templateId = selectElement.value;
    
    if (!templateId) {
      this.emailContent$.next('');
      this.emailSubject$.next('');
      this.emailForm.patchValue({ subject: '', body: '' });
      return;
    }

    const template = this.emailTemplates$.value.find(t => t.id === templateId);
    if (template) {
      this.emailSubject$.next(template.subject);
      this.emailContent$.next(template.body);
      this.emailForm.patchValue({
        subject: template.subject,
        body: template.body
      });
    }
  }

  sendEmail(): void {
    if (!this.emailForm.value.body) {
      this.errorMessage$.next('Please select an email template first');
      this.clearMessagesAfterDelay();
      return;
    }

    console.log('📧 Sending email:', {
      subject: this.emailForm.value.subject,
      body: this.emailForm.value.body,
      workflow: this.selectedWorkflow,
      customerName: this.customerName$.value,
      contactName: this.contactName$.value
    });

    this.successMessage$.next('Email sent successfully!');
    this.clearMessagesAfterDelay();
  }

  loadEnquiries(workflowId: number): void {
    console.log('🔄 Loading enquiries for workflow:', workflowId);
    this.isLoading$.next(true);
    this.errorMessage$.next('');

    this.workflowService.getInitialEnquiryForWorkflow(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(data => console.log('✅ Enquiries loaded:', data.length)),
        finalize(() => this.isLoading$.next(false)),
        catchError(error => {
          console.error('❌ Error loading enquiries:', error);
          this.errorMessage$.next('Failed to load enquiries. Please try again.');
          return of([]);
        })
      )
      .subscribe(data => {
        this.enquiries$.next(data);
      });
  }

  onSubmit(): void {
    if (this.enquiryForm.valid) {
      const enquiryData: InitialEnquiryDto = {
        workflowId: this.workflowId,
        comments: this.enquiryForm.value.comments,
        email: this.enquiryForm.value.email,
        images: this.enquiryForm.value.images || ''
      };

      if (this.isEditMode$.value && this.selectedEnquiryId) {
        enquiryData.enquiryId = this.selectedEnquiryId;
        this.updateEnquiry(enquiryData);
      } else {
        this.createEnquiry(enquiryData);
      }
    } else {
      this.markFormGroupTouched(this.enquiryForm);
    }
  }

  createEnquiry(enquiry: InitialEnquiryDto): void {
    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.workflowService.addInitialEnquiry(enquiry)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading$.next(false)),
        catchError(error => {
          console.error('❌ Error creating enquiry:', error);
          this.errorMessage$.next('Failed to create enquiry. Please try again.');
          return of(null);
        })
      )
      .subscribe(response => {
        if (response) {
          console.log('✅ Enquiry created successfully', response);
          this.successMessage$.next('Enquiry added successfully!');
          
          if (this.selectedWorkflow?.id) {
            this.loadEnquiries(this.selectedWorkflow.id);
          }
          
          this.resetForm();
          this.clearMessagesAfterDelay();
        }
      });
  }

  updateEnquiry(enquiry: InitialEnquiryDto): void {
    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.workflowService.updateInitialEnquiry(enquiry)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading$.next(false)),
        catchError(error => {
          console.error('❌ Error updating enquiry:', error);
          this.errorMessage$.next('Failed to update enquiry. Please try again.');
          return of(null);
        })
      )
      .subscribe(response => {
        if (response) {
          console.log('✅ Enquiry updated successfully', response);
          this.successMessage$.next('Enquiry updated successfully!');
          
          if (this.selectedWorkflow?.id) {
            this.loadEnquiries(this.selectedWorkflow.id);
          }
          
          this.resetForm();
          this.clearMessagesAfterDelay();
        }
      });
  }

  editEnquiry(enquiry: InitialEnquiryDto): void {
    this.isEditMode$.next(true);
    this.selectedEnquiryId = enquiry.enquiryId;
    this.errorMessage$.next('');
    this.successMessage$.next('');
    this.activeTab$.next('comments');
    
    this.enquiryForm.patchValue({
      comments: enquiry.comments,
      email: enquiry.email,
      images: enquiry.images
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.enquiryForm.reset();
    this.emailForm.reset();
    this.isEditMode$.next(false);
    this.selectedEnquiryId = undefined;
    this.emailContent$.next('');
    this.emailSubject$.next('');
  }

  cancelEdit(): void {
    this.resetForm();
    this.errorMessage$.next('');
    this.successMessage$.next('');
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  private clearMessagesAfterDelay(): void {
    setTimeout(() => {
      this.successMessage$.next('');
      this.errorMessage$.next('');
    }, 3000);
  }

  // Getters for form controls
  get comments() {
    return this.enquiryForm.get('comments');
  }

  get email() {
    return this.enquiryForm.get('email');
  }

  get images() {
    return this.enquiryForm.get('images');
  }
}