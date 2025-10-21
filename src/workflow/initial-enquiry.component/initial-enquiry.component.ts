import { Component } from '@angular/core';
import { Workflow } from '../../model/create-quote';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { SelectedWorkflow, WorkflowStateService } from '../../service/workflow-state.service';

@Component({
  selector: 'app-initial-enquiry.component',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './initial-enquiry.component.html',
  styleUrl: './initial-enquiry.component.css'
})
export class InitialEnquiryComponent {
 customerId: number | null = null;
  customerName: string = '';
  selectedWorkflowData: SelectedWorkflow | null = null;
  
  workflows: Workflow[] = [];
  selectedWorkflow: number | null = null;
  
  activeTab: string = 'comments';
  comments: string = '';
  emailContent: string = '';
  images: File[] = [];
  
  isLoading: boolean = false;
  successMessage: string = '';
  
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workflowStateService: WorkflowStateService
  ) {}

  ngOnInit() {
    // Get customer information from query params
    this.route.queryParams.subscribe(params => {
      this.customerId = params['customerId'] ? +params['customerId'] : null;
      this.customerName = params['customerName'] || '';
    });

    // Get selected workflow from service
    this.workflowStateService.selectedWorkflow$
      .pipe(takeUntil(this.destroy$))
      .subscribe(workflow => {
        this.selectedWorkflowData = workflow;
        if (workflow) {
          // Pre-populate with selected workflow
          this.workflows = [{
            id: workflow.id,
            name: workflow.product,
            product: workflow.product
          }];
          this.selectedWorkflow = workflow.id;
        } else {
          // If no workflow selected, redirect back to list
          this.router.navigate(['/workflow/list'], {
            queryParams: {
              customerId: this.customerId,
              customerName: this.customerName
            }
          });
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  goToNextStage() {
    const nextStage = this.workflowStateService.getNextEnabledStage('initial-enquiry');
    if (nextStage) {
      this.router.navigate([`/workflow/${nextStage}`], {
        queryParams: {
          customerId: this.customerId,
          customerName: this.customerName
        }
      });
    } else {
      // No more stages, go back to workflow list
      this.router.navigate(['/workflow/list'], {
        queryParams: {
          customerId: this.customerId,
          customerName: this.customerName
        }
      });
    }
  }

  onFileSelect(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        this.images.push(files[i]);
      }
    }
  }

  removeImage(index: number) {
    this.images.splice(index, 1);
  }

  saveComments() {
    if (!this.selectedWorkflow) {
      alert('Please select a workflow');
      return;
    }

    this.isLoading = true;
    
    // Simulate API call
    setTimeout(() => {
      this.successMessage = 'Comments saved successfully!';
      this.isLoading = false;
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        this.successMessage = '';
        // Move to next stage
        this.goToNextStage();
      }, 2000);
    }, 1000);

    // Here you would make an actual API call
    // this.workflowService.saveInitialEnquiry(this.selectedWorkflow, {
    //   comments: this.comments,
    //   email: this.emailContent,
    //   images: this.images
    // }).subscribe(...)
  }

  saveEmail() {
    if (!this.selectedWorkflow) {
      alert('Please select a workflow');
      return;
    }

    this.isLoading = true;
    
    setTimeout(() => {
      this.successMessage = 'Email saved successfully!';
      this.isLoading = false;
      
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    }, 1000);
  }

  saveImages() {
    if (!this.selectedWorkflow) {
      alert('Please select a workflow');
      return;
    }

    if (this.images.length === 0) {
      alert('Please select at least one image');
      return;
    }

    this.isLoading = true;
    
    setTimeout(() => {
      this.successMessage = 'Images uploaded successfully!';
      this.isLoading = false;
      
      setTimeout(() => {
        this.successMessage = '';
      }, 3000);
    }, 1000);
  }
}