// Add to initial-enquiry.component.ts

import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SelectedWorkflow, WorkflowStateService } from '../../service/workflow-state.service';
import { InitialEnquiryDto, WorkflowService } from '../../service/workflow.service';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

@Component({
  selector: 'app-initial-enquiry.component',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './initial-enquiry.component.html',
  styleUrl: './initial-enquiry.component.css'
})
export class InitialEnquiryComponent implements OnInit {
  @Input() workflowId!: number;
  
  enquiryForm: FormGroup;
  emailForm: FormGroup;
  enquiries: InitialEnquiryDto[] = [];
  isLoading = false;
  isEditMode = false;
  selectedEnquiryId?: number;
  errorMessage = '';
  successMessage = '';
  
  selectedWorkflow: SelectedWorkflow | null = null;
  private subscription!: Subscription;

  // Email Template properties
  activeTab: 'comments' | 'email' | 'images' = 'comments';
  selectedTemplate: string = '';
  emailContent: string = '';
  emailSubject: string = '';
  loggedInUserName: string = 'Michael'; // Default user name

  emailTemplates: EmailTemplate[] = [
    {
      id: 'template-enquiry',
      name: 'Template-Enquiry',
      subject: 'Thank You for Your Enquiry',
      body: `Hi [Insert Name],

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
      body: `Dear [Insert Name],

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
      body: `Dear [Recipient's Name],

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
      body: `Hi [Recipient's Name],

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
      body: `Hi [Recipient's Name],

I hope you're keeping well. I just wanted to follow up on the quotes I sent over on [insert date].

If you have any questions or need further details, please don't hesitate to get in touch — I'm happy to help.

If you're interested, you're very welcome to visit our showroom in Sandyford to see the Renson Camargue in person.

Looking forward to hearing from you.

Best regards,
${this.loggedInUserName}

Awnings of Ireland`
    }
  ];

  constructor(
    private fb: FormBuilder,
    private workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService
  ) {
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
    this.subscription = this.workflowStateService.selectedWorkflow$
      .subscribe(workflow => {
        this.selectedWorkflow = workflow;
        console.log('Selected workflow:', workflow);
      });

    if (this.selectedWorkflow) {
      this.loadEnquiries();
    }
  }

  // Tab switching
  switchTab(tab: 'comments' | 'email' | 'images'): void {
    this.activeTab = tab;
  }

  // Email template selection
  onTemplateSelect(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const templateId = selectElement.value;
    
    if (!templateId) {
      this.emailContent = '';
      this.emailSubject = '';
      this.emailForm.patchValue({
        subject: '',
        body: ''
      });
      return;
    }

    const template = this.emailTemplates.find(t => t.id === templateId);
    if (template) {
      this.emailSubject = template.subject;
      this.emailContent = template.body;
      this.emailForm.patchValue({
        subject: template.subject,
        body: template.body
      });
    }
  }

  // Send email
  sendEmail(): void {
    if (!this.emailForm.value.body) {
      this.errorMessage = 'Please select an email template first';
      this.clearMessagesAfterDelay();
      return;
    }

    // Here you would implement the actual email sending logic
    console.log('Sending email:', {
      subject: this.emailForm.value.subject,
      body: this.emailForm.value.body,
      workflow: this.selectedWorkflow
    });

    this.successMessage = 'Email sent successfully!';
    this.clearMessagesAfterDelay();
  }

  loadEnquiries(): void {
    this.isLoading = true;
    this.errorMessage = '';
    if (!this.selectedWorkflow?.id) return;

    this.workflowService.getInitialEnquiryForWorkflow(this.selectedWorkflow?.id).subscribe({
      next: (data) => {
        this.enquiries = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading enquiries:', error);
        this.errorMessage = 'Failed to load enquiries. Please try again.';
        this.isLoading = false;
      }
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

      if (this.isEditMode && this.selectedEnquiryId) {
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
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.workflowService.addInitialEnquiry(enquiry).subscribe({
      next: (response) => {
        console.log('Enquiry created successfully', response);
        this.successMessage = 'Enquiry added successfully!';
        this.loadEnquiries();
        this.resetForm();
        this.isLoading = false;
        this.clearMessagesAfterDelay();
      },
      error: (error) => {
        console.error('Error creating enquiry:', error);
        this.errorMessage = 'Failed to create enquiry. Please try again.';
        this.isLoading = false;
      }
    });
  }

  updateEnquiry(enquiry: InitialEnquiryDto): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.workflowService.updateInitialEnquiry(enquiry).subscribe({
      next: (response) => {
        console.log('Enquiry updated successfully', response);
        this.successMessage = 'Enquiry updated successfully!';
        this.loadEnquiries();
        this.resetForm();
        this.isLoading = false;
        this.clearMessagesAfterDelay();
      },
      error: (error) => {
        console.error('Error updating enquiry:', error);
        this.errorMessage = 'Failed to update enquiry. Please try again.';
        this.isLoading = false;
      }
    });
  }

  editEnquiry(enquiry: InitialEnquiryDto): void {
    this.isEditMode = true;
    this.selectedEnquiryId = enquiry.enquiryId;
    this.errorMessage = '';
    this.successMessage = '';
    this.activeTab = 'comments';
    
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
    this.isEditMode = false;
    this.selectedEnquiryId = undefined;
    this.emailContent = '';
    this.emailSubject = '';
  }

  cancelEdit(): void {
    this.resetForm();
    this.errorMessage = '';
    this.successMessage = '';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  private clearMessagesAfterDelay(): void {
    setTimeout(() => {
      this.successMessage = '';
      this.errorMessage = '';
    }, 3000);
  }

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