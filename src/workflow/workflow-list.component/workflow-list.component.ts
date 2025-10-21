import { Component,  OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { WorkflowStage } from '../../model/workflow.model';
import { WorkflowService } from '../../service/workflow.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SelectedWorkflow, WorkflowStateService, WorkflowStages  } from '../../service/workflow-state.service';

interface Workflow {
  id?: number;
  product: string;
  description: string;
  initialEnquiry: boolean;
  createQuote: boolean;
  inviteShowroom: boolean;
  setupSiteVisit: boolean;
  invoice: boolean;
  dateAdded: Date;
  addedBy: string;
}

interface Supplier {
  id: number;
  name: string;
}

interface ProductModel {
  id: number;
  name: string;
}


@Component({
  selector: 'app-workflow-list.component',
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow-list.component.html',
  styleUrl: './workflow-list.component.css'
})
export class WorkflowListComponent {

 workflows: Workflow[] = [];
  suppliers: Supplier[] = [];
  models: ProductModel[] = [];
  
  selectedSupplier: number | null = null;
  selectedModel: number | null = null;
  
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  
  customerId: number | null = null;
  customerName: string = '';
  
  isLoading = false;
  errorMessage = '';
  
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
      
      // Load workflows after getting customer info
      if (this.customerId) {
        this.loadStaticWorkflows();
      }
    });

    this.loadSuppliers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSuppliers() {
    // Static suppliers data
    this.suppliers = [
      { id: 1, name: 'Markilux' },
      { id: 2, name: 'Weinor' },
      { id: 3, name: 'Gibus' },
      { id: 4, name: 'Warema' }
    ];
  }

  onSupplierChange(event: any) {
    this.selectedSupplier = event.target.value ? +event.target.value : null;
    
    if (this.selectedSupplier) {
      // Load models based on supplier
      this.models = [
        { id: 1, name: 'Markilux 990' },
        { id: 2, name: 'Markilux 1600' },
        { id: 3, name: 'Markilux 3300' },
        { id: 4, name: 'Markilux 5010' }
      ];
      this.selectedModel = null;
    } else {
      this.models = [];
      this.selectedModel = null;
    }
  }

  onModelChange(event: any) {
    this.selectedModel = event.target.value ? +event.target.value : null;
  }

  loadStaticWorkflows() {
    this.isLoading = true;
    
    // Static workflow data
    this.workflows = [
      {
        id: 1,
        product: 'Markilux 990',
        description: 'Folding Arm Awning',
        initialEnquiry: true,
        createQuote: true,
        inviteShowroom: true,
        setupSiteVisit: false,
        invoice: false,
        dateAdded: new Date('2024-10-15T10:30:00'),
        addedBy: 'John Smith'
      },
      {
        id: 2,
        product: 'Markilux 1600',
        description: 'Cassette Awning',
        initialEnquiry: true,
        createQuote: true,
        inviteShowroom: true,
        setupSiteVisit: true,
        invoice: false,
        dateAdded: new Date('2024-10-10T14:20:00'),
        addedBy: 'Sarah Johnson'
      },
      {
        id: 3,
        product: 'Weinor Semina',
        description: 'Pergola Awning',
        initialEnquiry: true,
        createQuote: true,
        inviteShowroom: true,
        setupSiteVisit: true,
        invoice: true,
        dateAdded: new Date('2024-10-05T09:15:00'),
        addedBy: 'Michael Brown'
      }
    ];
    
    this.isLoading = false;
    this.totalPages = 1;
  }

  addNewWorkflow() {
    if (!this.selectedSupplier || !this.selectedModel) {
      alert('Please select both supplier and model');
      return;
    }

    const supplier = this.suppliers.find(s => s.id === this.selectedSupplier);
    const model = this.models.find(m => m.id === this.selectedModel);

    const newWorkflow: Workflow = {
      id: this.workflows.length + 1,
      product: `${supplier?.name} ${model?.name}`,
      description: `${model?.name} for outside the back garden`,
      initialEnquiry: false,
      createQuote: false,
      inviteShowroom: false,
      setupSiteVisit: false,
      invoice: false,
      dateAdded: new Date(),
      addedBy: 'Current User'
    };

    this.workflows.unshift(newWorkflow);
    this.selectedSupplier = null;
    this.selectedModel = null;
    this.models = [];
  }

  toggleStage(workflow: Workflow, stage: keyof Workflow, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    if (workflow.id) {
      const stageValue = workflow[stage];
      if (typeof stageValue === 'boolean') {
        // Use type assertion to fix the TypeScript error
        (workflow as any)[stage] = !stageValue;
      }
    }
  }

  selectWorkflow(workflow: Workflow): void {
    // Prepare the selected workflow with enabled stages
    const selectedWorkflow: SelectedWorkflow = {
      id: workflow.id!,
      product: workflow.product,
      description: workflow.description,
      stages: {
        initialEnquiry: workflow.initialEnquiry,
        createQuote: workflow.createQuote,
        inviteShowroom: workflow.inviteShowroom,
        setupSiteVisit: workflow.setupSiteVisit,
        invoice: workflow.invoice
      },
      customerId: this.customerId || undefined,
      customerName: this.customerName
    };

    // Set the selected workflow in the service
    this.workflowStateService.setSelectedWorkflow(selectedWorkflow);

    // Navigate to the first enabled stage
    const enabledStages = this.workflowStateService.getEnabledStages();
    if (enabledStages.length > 0) {
      this.router.navigate([`/workflow/${enabledStages[0]}`], {
        queryParams: {
          customerId: this.customerId,
          customerName: this.customerName
        }
      });
    } else {
      alert('Please enable at least one stage for this workflow');
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  getStatusClass(stageName: string): string {
    return ''; // Status classes can be added if needed
  }
}