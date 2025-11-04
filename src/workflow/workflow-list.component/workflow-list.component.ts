import { Component,  OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { WorkflowStage } from '../../model/workflow.model';
import { CreateWorkflowDto, ProductDto, ProductTypeDto, SupplierDto, WorkflowDto, WorkflowService } from '../../service/workflow.service';
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
workflows: WorkflowDto[] = [];
  suppliers: SupplierDto[] = [];
  productTypes: ProductTypeDto[] = [];
  products: ProductDto[] = [];
  
  selectedSupplier: number | null = null;
  selectedProductType: number | null = null;
  selectedProduct: number | null = null;
  
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  
  customerId: number | null = null;
  customerName: string = '';
  
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workflowStateService: WorkflowStateService,
    private workflowService: WorkflowService
  ) {}

  ngOnInit() {
    // Get customer info from route params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? +params['customerId'] : null;
        this.customerName = params['customerName'] || '';
        
        if (this.customerId) {
          this.loadWorkflowsFromApi(this.customerId);
        }
      });

    // Load suppliers from API
    this.loadSuppliers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all suppliers from API
   */
  loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (suppliers) => {
          this.suppliers = suppliers;
        },
        error: (error) => {
          console.error('Failed to load suppliers', error);
          this.errorMessage = 'Failed to load suppliers. Please try again.';
        }
      });
  }

  /**
   * Handle supplier selection change
   * Load product types for selected supplier
   */
  onSupplierChange(supplierId: number) {
    this.selectedSupplier = supplierId;// event.target.value ? +event.target.value : null;
    this.selectedProductType = null;
    this.selectedProduct = null;
    this.productTypes = [];
    this.products = [];
    
    if (this.selectedSupplier) {
      
      this.workflowService.getAllProductTypesForSupplier(this.selectedSupplier)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (productTypes) => {
            this.productTypes = productTypes;
          },
          error: (error) => {
            console.error('Failed to load product types', error);
            this.errorMessage = 'Failed to load product types. Please try again.';
          }
        });
    }
  }

  /**
   * Handle product type selection change
   * Load products for selected supplier and product type
   */
  onProductTypeChange(productTypeId: number) {
    this.selectedProductType = productTypeId; //event.target.value ? +event.target.value : null;
    this.selectedProduct = null;
    this.products = [];
    
    if (this.selectedSupplier && this.selectedProductType) {
      this.workflowService.getAllProductsBySupplier(this.selectedSupplier, this.selectedProductType)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (products) => {
            this.products = products;
          },
          error: (error) => {
            console.error('Failed to load products', error);
            this.errorMessage = 'Failed to load products. Please try again.';
          }
        });
    }
  }

  /**
   * Handle product selection change
   */
  onProductChange(productID: number) {
    this.selectedProduct = productID; // event.target.value ? +event.target.value : null;
  }

  /**
   * Load workflows from API for a specific customer
   */
  loadWorkflowsFromApi(customerId: number) {
    this.isLoading = true;
    this.errorMessage = '';
    
    this.workflowService.getWorkflowsForCustomer(customerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workflows) => {
          this.workflows = workflows.map(w => ({
            ...w,
            dateAdded: new Date(w.dateAdded)
          }));
          this.isLoading = false;
          this.calculateTotalPages();
        },
        error: (error) => {
          console.error('Failed to load workflows', error);
          this.errorMessage = 'Failed to load workflows. Please try again.';
          this.isLoading = false;
        }
      });
  }

  /**
   * Add a new workflow using the API
   */
  addNewWorkflow() {
    if (!this.selectedSupplier || !this.selectedProductType || !this.selectedProduct || !this.customerId) {
      this.errorMessage = 'Please select supplier, product type, and product';
      return;
    }

    const supplier = this.suppliers.find(s => s.supplierId === this.selectedSupplier);
    const productType = this.productTypes.find(pt => pt.productTypeId === this.selectedProductType);
    const product = this.products.find(p => p.productId === this.selectedProduct);

    const newWorkflowDto: WorkflowDto = {
      workflowId: 0,
      workflowName: '',
      productName: product?.productName || '',
      description: `${supplier?.supplierName || ''} - ${productType?.description || ''} - ${product?.productName || ''}`,
      initialEnquiry: false,
      createQuotation: false,
      inviteShowRoomVisit: false,
      setupSiteVisit: false,
      invoiceSent: false,
      dateAdded: new Date().toISOString(),
      addedBy: 'Current User',
      customerId: this.customerId,
      supplierId: this.selectedSupplier,
      productId: this.selectedProduct,
      productTypeId: this.selectedProductType
    };

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.workflowService.createWorkflow(newWorkflowDto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (created) => {
          console.log('Workflow created successfully', created);
          this.successMessage = 'Workflow created successfully!';
          
          // Reload workflows to get the updated list
          this.loadWorkflowsFromApi(this.customerId!);
          
          // Reset form
          this.selectedSupplier = null;
          this.selectedProductType = null;
          this.selectedProduct = null;
          this.productTypes = [];
          this.products = [];
          
          // Clear success message after 3 seconds
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        },
        error: (error) => {
          console.error('Failed to create workflow', error);
          this.errorMessage = 'Failed to create workflow. Please try again.';
          this.isLoading = false;
        }
      });
  }

  /**
   * Toggle a workflow stage and update via API
   */
  toggleStage(workflow: WorkflowDto, stage: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    // NEW (complete with all required fields):
    const updatedWorkflow: WorkflowDto = {
      workflowId: workflow.workflowId,
      workflowName: workflow.workflowName,
      productName: workflow.productName,
      description: workflow.description,
      initialEnquiry: workflow.initialEnquiry,
      createQuotation: workflow.createQuotation,
      inviteShowRoomVisit: workflow.inviteShowRoomVisit,
      setupSiteVisit: workflow.setupSiteVisit,
      invoiceSent: workflow.invoiceSent,
      dateAdded: workflow.dateAdded,
      addedBy: workflow.addedBy,
      customerId: workflow.customerId,      
      supplierId: workflow.supplierId,    
      productId: workflow.productId,      
      productTypeId: workflow.productTypeId 
    };

    // Map frontend stage names to DTO properties
    const stageMapping: { [key: string]: keyof WorkflowDto } = {
      'initialEnquiry': 'initialEnquiry',
      'createQuote': 'createQuotation',
      'inviteShowroom': 'inviteShowRoomVisit',
      'setupSiteVisit': 'setupSiteVisit',
      'invoice': 'invoiceSent'
    };

    const dtoProperty = stageMapping[stage];
    if (!dtoProperty) {
      console.error('Invalid stage name:', stage);
      return;
    }

    // Toggle the stage value
    (updatedWorkflow as any)[dtoProperty] = !(updatedWorkflow as any)[dtoProperty];

    // Save to API
    this.workflowService.updateWorkflow(updatedWorkflow)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          console.log('Workflow updated successfully', updated);
          
          // Update local workflow list
          const index = this.workflows.findIndex(w => w.workflowId === workflow.workflowId);
          if (index !== -1) {
            this.workflows[index] = updatedWorkflow;
          }
        },
        error: (error) => {
          console.error('Failed to update workflow', error);
          this.errorMessage = 'Failed to update workflow stage. Please try again.';
          
          // Revert the toggle on error
          (updatedWorkflow as any)[dtoProperty] = !(updatedWorkflow as any)[dtoProperty];
          
          // Clear error message after 3 seconds
          setTimeout(() => {
            this.errorMessage = '';
          }, 3000);
        }
      });
  }

  /**
   * Select a workflow and navigate to the first enabled stage
   */
  selectWorkflow(workflow: WorkflowDto) {
    const selected: SelectedWorkflow = {
      id: workflow.workflowId,
      productId: workflow.productId,
      product: workflow.productName,
      description: workflow.description,
      stages: {
        initialEnquiry: workflow.initialEnquiry,
        createQuote: workflow.createQuotation,
        inviteShowroom: workflow.inviteShowRoomVisit,
        setupSiteVisit: workflow.setupSiteVisit,
        invoice: workflow.invoiceSent
      },
      customerId: this.customerId || undefined,
      customerName: this.customerName
    };

    this.workflowStateService.setSelectedWorkflow(selected);

    const enabledStages = this.workflowStateService.getEnabledStages();
    if (enabledStages.length > 0) {
      this.router.navigate([`/workflow/${enabledStages[0]}`], {
        queryParams: { 
          customerId: this.customerId, 
          customerName: this.customerName,
          workflowId: workflow.workflowId 
        }
      });
    } else {
      this.errorMessage = 'Please enable at least one stage for this workflow';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
    }
  }

  /**
   * Pagination methods
   */
  calculateTotalPages() {
    this.totalPages = Math.ceil(this.workflows.length / this.pageSize);
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

  /**
   * Get paginated workflows for display
   */
  get paginatedWorkflows(): WorkflowDto[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.workflows.slice(startIndex, endIndex);
  }
}