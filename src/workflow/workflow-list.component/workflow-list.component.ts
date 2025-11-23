import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, tap, catchError, finalize, map, switchMap } from 'rxjs/operators';
import { 
  WorkflowService, 
  WorkflowDto, 
  SupplierDto, 
  ProductTypeDto, 
  ProductDto 
} from '../../service/workflow.service';
import { 
  WorkflowStateService, 
  SelectedWorkflow 
} from '../../service/workflow-state.service';

@Component({
  selector: 'app-workflow-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow-list.component.html',
  styleUrl: './workflow-list.component.css'
})
export class WorkflowListComponent implements OnInit, OnDestroy {
  // Observables for data
  workflows$!: Observable<WorkflowDto[]>;
  suppliers$!: Observable<SupplierDto[]>;
  productTypes$!: Observable<ProductTypeDto[]>;
  products$!: Observable<ProductDto[]>;
  paginatedWorkflows$!: Observable<WorkflowDto[]>;
  
  // BehaviorSubjects for state management
  isLoading$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  
  // Selection subjects
  private selectedSupplierSubject$ = new BehaviorSubject<number | null>(null);
  private selectedProductTypeSubject$ = new BehaviorSubject<number | null>(null);
  private selectedProductSubject$ = new BehaviorSubject<number | null>(null);
  
  // Pagination subjects
  currentPage$ = new BehaviorSubject<number>(1);
  pageSize = 10;
  totalPages$ = new BehaviorSubject<number>(1);
  
  // Model bindings for selects
  selectedSupplier: number | null = null;
  selectedProductType: number | null = null;
  selectedProduct: number | null = null;
  
  customerId: number | null = null;
  customerName: string = '';
  
  private destroy$ = new Subject<void>();
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workflowStateService: WorkflowStateService,
    private workflowService: WorkflowService
  ) {}

  ngOnInit() {
    console.log('📄 Workflow List Component Initialized');
    
    // Get customer info from route params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? +params['customerId'] : null;
        this.customerName = params['customerName'] || '';
        
        if (this.customerId) {
          this.loadWorkflows(this.customerId);
        }
      });

    // Load suppliers
    this.loadSuppliers();
    
    // Setup product types observable
    this.productTypes$ = this.selectedSupplierSubject$.pipe(
      switchMap(supplierId => {
        if (!supplierId) {
          return new BehaviorSubject<ProductTypeDto[]>([]);
        }
        return this.workflowService.getAllProductTypesForSupplier(supplierId).pipe(
          catchError(error => {
            console.error('Failed to load product types', error);
            this.errorMessage$.next('Failed to load product types');
            return new BehaviorSubject<ProductTypeDto[]>([]);
          })
        );
      })
    );
    
    // Setup products observable
    this.products$ = combineLatest([
      this.selectedSupplierSubject$,
      this.selectedProductTypeSubject$
    ]).pipe(
      switchMap(([supplierId, productTypeId]) => {
        if (!supplierId || !productTypeId) {
          return new BehaviorSubject<ProductDto[]>([]);
        }
        return this.workflowService.getAllProductsBySupplier(supplierId, productTypeId).pipe(
          catchError(error => {
            console.error('Failed to load products', error);
            this.errorMessage$.next('Failed to load products');
            return new BehaviorSubject<ProductDto[]>([]);
          })
        );
      })
    );
    
    // Setup workflows observable
    this.workflows$ = this.workflowsSubject$.asObservable();
    
    // Setup paginated workflows
    this.paginatedWorkflows$ = combineLatest([
      this.workflows$,
      this.currentPage$
    ]).pipe(
      map(([workflows, currentPage]) => {
        const startIndex = (currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        return workflows.slice(startIndex, endIndex);
      })
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSuppliers() {
    this.suppliers$ = this.workflowService.getAllSuppliers().pipe(
      tap(suppliers => console.log('✅ Suppliers loaded:', suppliers.length)),
      catchError(error => {
        console.error('❌ Failed to load suppliers', error);
        this.errorMessage$.next('Failed to load suppliers. Please try again.');
        return new BehaviorSubject<SupplierDto[]>([]);
      })
    );
  }

  onSupplierChange(supplierId: number) {
    console.log('📄 Supplier changed:', supplierId);
    this.selectedSupplier = supplierId;
    this.selectedProductType = null;
    this.selectedProduct = null;
    
    this.selectedSupplierSubject$.next(supplierId);
    this.selectedProductTypeSubject$.next(null);
    this.selectedProductSubject$.next(null);
  }

  onProductTypeChange(productTypeId: number) {
    console.log('📄 Product type changed:', productTypeId);
    this.selectedProductType = productTypeId;
    this.selectedProduct = null;
    
    this.selectedProductTypeSubject$.next(productTypeId);
    this.selectedProductSubject$.next(null);
  }

  onProductChange(productId: number) {
    console.log('📄 Product changed:', productId);
    this.selectedProduct = productId;
    this.selectedProductSubject$.next(productId);
  }

  loadWorkflows(customerId: number) {
    console.log('📄 Loading workflows for customer:', customerId);
    this.isLoading$.next(true);
    this.errorMessage$.next('');
    
    this.workflowService.getWorkflowsForCustomer(customerId)
      .pipe(
        takeUntil(this.destroy$),
        tap(workflows => console.log('✅ Workflows loaded:', workflows.length)),
        map(workflows => workflows.map(w => ({
          ...w,
          dateAdded: new Date(w.dateAdded)
        }))),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe({
        next: (workflows) => {
          this.workflowsSubject$.next(workflows);
          this.calculateTotalPages(workflows.length);
        },
        error: (error) => {
          console.error('❌ Failed to load workflows', error);
          this.errorMessage$.next('Failed to load workflows. Please try again.');
        }
      });
  }

  addNewWorkflow() {
    if (!this.selectedSupplier || !this.selectedProductType || !this.selectedProduct || !this.customerId) {
      this.errorMessage$.next('Please select supplier, product type, and product');
      this.clearMessagesAfterDelay();
      return;
    }

    // Get current values from observables
    let suppliers: SupplierDto[] = [];
    let productTypes: ProductTypeDto[] = [];
    let products: ProductDto[] = [];

    this.suppliers$.pipe(takeUntil(this.destroy$)).subscribe(s => suppliers = s);
    this.productTypes$.pipe(takeUntil(this.destroy$)).subscribe(pt => productTypes = pt);
    this.products$.pipe(takeUntil(this.destroy$)).subscribe(p => products = p);

    const supplier = suppliers.find(s => s.supplierId === this.selectedSupplier);
    const productType = productTypes.find(pt => pt.productTypeId === this.selectedProductType);
    const product = products.find(p => p.productId === this.selectedProduct);

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

    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.workflowService.createWorkflow(newWorkflowDto)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe({
        next: (created) => {
          console.log('✅ Workflow created successfully', created);
          this.successMessage$.next('Workflow created successfully!');
          
          // Reload workflows
          this.loadWorkflows(this.customerId!);
          
          // Reset form
          this.selectedSupplier = null;
          this.selectedProductType = null;
          this.selectedProduct = null;
          this.selectedSupplierSubject$.next(null);
          this.selectedProductTypeSubject$.next(null);
          this.selectedProductSubject$.next(null);
          
          this.clearMessagesAfterDelay();
        },
        error: (error) => {
          console.error('❌ Failed to create workflow', error);
          this.errorMessage$.next('Failed to create workflow. Please try again.');
        }
      });
  }

  toggleStage(workflow: WorkflowDto, stage: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    const updatedWorkflow: WorkflowDto = { ...workflow };

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

    (updatedWorkflow as any)[dtoProperty] = !(updatedWorkflow as any)[dtoProperty];

    this.workflowService.updateWorkflow(updatedWorkflow)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          console.log('✅ Workflow updated successfully', updated);
          
          // Update local workflows array
          const currentWorkflows = this.workflowsSubject$.value;
          const index = currentWorkflows.findIndex(w => w.workflowId === workflow.workflowId);
          if (index !== -1) {
            currentWorkflows[index] = updatedWorkflow;
            this.workflowsSubject$.next([...currentWorkflows]);
          }
        },
        error: (error) => {
          console.error('❌ Failed to update workflow', error);
          this.errorMessage$.next('Failed to update workflow stage. Please try again.');
          this.clearMessagesAfterDelay();
        }
      });
  }

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
      this.errorMessage$.next('Please enable at least one stage for this workflow');
      this.clearMessagesAfterDelay();
    }
  }

  calculateTotalPages(totalItems: number) {
    const pages = Math.ceil(totalItems / this.pageSize);
    this.totalPages$.next(pages);
  }

  goToPage(page: number) {
    const totalPages = this.totalPages$.value;
    if (page >= 1 && page <= totalPages) {
      this.currentPage$.next(page);
    }
  }

  previousPage() {
    const currentPage = this.currentPage$.value;
    if (currentPage > 1) {
      this.currentPage$.next(currentPage - 1);
    }
  }

  nextPage() {
    const currentPage = this.currentPage$.value;
    const totalPages = this.totalPages$.value;
    if (currentPage < totalPages) {
      this.currentPage$.next(currentPage + 1);
    }
  }

  goToLastPage() {
    const totalPages = this.totalPages$.value;
    this.goToPage(totalPages);
  }

  private clearMessagesAfterDelay(): void {
    setTimeout(() => {
      this.successMessage$.next('');
      this.errorMessage$.next('');
    }, 3000);
  }
}