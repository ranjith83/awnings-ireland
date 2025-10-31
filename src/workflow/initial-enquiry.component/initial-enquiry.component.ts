import { Component, Input, OnInit } from '@angular/core';
import { Workflow } from '../../model/create-quote';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup,  ReactiveFormsModule,  Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { SelectedWorkflow, WorkflowStateService } from '../../service/workflow-state.service';
import { InitialEnquiryDto, WorkflowService } from '../../service/workflow.service';

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
  enquiries: InitialEnquiryDto[] = [];
  isLoading = false;
  isEditMode = false;
  selectedEnquiryId?: number;
  errorMessage = '';
  successMessage = '';
  
 selectedWorkflow: SelectedWorkflow | null = null;
  private subscription!: Subscription;

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
  }

  ngOnInit(): void {

    this.subscription = this.workflowStateService.selectedWorkflow$
      .subscribe(workflow => {
        this.selectedWorkflow = workflow;
      //  this.workflowId = workflow?.id
        console.log('Selected workflow:', workflow);
      });

    if (this.selectedWorkflow) {
      this.loadEnquiries();
    }
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
    
    this.enquiryForm.patchValue({
      comments: enquiry.comments,
      email: enquiry.email,
      images: enquiry.images
    });

    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.enquiryForm.reset();
    this.isEditMode = false;
    this.selectedEnquiryId = undefined;
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