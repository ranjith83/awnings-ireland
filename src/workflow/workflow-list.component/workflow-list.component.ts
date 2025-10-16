import { Component } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ProductModel, WorkflowStage,Workflow,Supplier } from '../../model/workflow.model';
import { WorkflowService } from '../../service/workflow.service';

@Component({
  selector: 'app-workflow-list.component',
  imports: [],
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
  
  activeTab = WorkflowStage.WORKFLOW;
  workflowStages = WorkflowStage;
  
  isLoading = false;
  errorMessage = '';
  
  private destroy$ = new Subject<void>();

  constructor(private workflowService: WorkflowService) {}

  ngOnInit() {
   // this.loadSuppliers();
   // this.loadWorkflows();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSuppliers() {
    this.workflowService.getSuppliers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (suppliers) => {
          this.suppliers = suppliers;
        },
        error: (error) => {
          console.error('Error loading suppliers:', error);
        }
      });
  }

  onSupplierChange() {
    if (this.selectedSupplier) {
      this.workflowService.getModelsBySupplier(this.selectedSupplier)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (models) => {
            this.models = models;
            this.selectedModel = null;
          },
          error: (error) => {
            console.error('Error loading models:', error);
          }
        });
    } else {
      this.models = [];
      this.selectedModel = null;
    }
  }

  loadWorkflows() {
    this.isLoading = true;
    this.workflowService.getWorkflows(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.workflows = response.data || response;
          this.totalPages = response.totalPages || 1;
          this.isLoading = false;
        },
        error: (error) => {
          this.errorMessage = 'Error loading workflows';
          this.isLoading = false;
          console.error('Error loading workflows:', error);
        }
      });
  }

  addNewWorkflow() {
    if (!this.selectedSupplier || !this.selectedModel) {
      alert('Please select both supplier and model');
      return;
    }

    const supplier = this.suppliers.find(s => s.id === this.selectedSupplier);
    const model = this.models.find(m => m.id === this.selectedModel);

    const newWorkflow: Workflow = {
      product: `${supplier?.name} ${model?.name}`,
      description: `${model?.name} for outside the back garden`,
      initialEnquiry: false,
      createQuote: false,
      inviteShowroom: false,
      setupSiteVisit: false,
      invoice: false,
      dateAdded: new Date(),
      addedBy: 'Current User', // Replace with actual user
      //supplierId: this.selectedSupplier,
      //modelId: this.selectedModel
    };

    this.workflowService.createWorkflow(newWorkflow)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workflow) => {
          this.workflows.unshift(workflow);
          this.selectedSupplier = null;
          this.selectedModel = null;
          this.models = [];
        },
        error: (error) => {
          this.errorMessage = 'Error creating workflow';
          console.error('Error creating workflow:', error);
        }
      });
  }

  toggleStage(workflow: Workflow, stage: keyof Workflow) {
    if (workflow.id) {
      const currentValue = workflow[stage] as boolean;
      this.workflowService.updateWorkflowStage(workflow.id, stage, !currentValue)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (updatedWorkflow) => {
            const index = this.workflows.findIndex(w => w.id === workflow.id);
            if (index !== -1) {
              this.workflows[index] = updatedWorkflow;
            }
          },
          error: (error: any) => {
            console.error('Error updating workflow stage:', error);
          }
        });
    }
  }

  setActiveTab(tab: WorkflowStage) {
    this.activeTab = tab;
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadWorkflows();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadWorkflows();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadWorkflows();
    }
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }
}
