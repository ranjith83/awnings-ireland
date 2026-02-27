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
  // Observables
  workflows$!: Observable<WorkflowDto[]>;
  suppliers$!: Observable<SupplierDto[]>;
  productTypes$!: Observable<ProductTypeDto[]>;
  products$!: Observable<ProductDto[]>;
  paginatedWorkflows$!: Observable<WorkflowDto[]>;

  // State subjects
  isLoading$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');

  // Cascade select subjects
  private selectedSupplierSubject$ = new BehaviorSubject<number | null>(null);
  private selectedProductTypeSubject$ = new BehaviorSubject<number | null>(null);
  private selectedProductSubject$ = new BehaviorSubject<number | null>(null);

  // Pagination
  currentPage$ = new BehaviorSubject<number>(1);
  pageSize = 10;
  totalPages$ = new BehaviorSubject<number>(1);

  // Form bindings — "Add" form
  selectedSupplier: number | null = null;
  selectedProductType: number | null = null;
  selectedProduct: number | null = null;
  newWorkflowName: string = '';
  newWorkflowDescription: string = '';

  // Edit modal state
  showEditModal = false;
  editingWorkflow: WorkflowDto | null = null;
  editWorkflowName = '';
  editWorkflowDescription = '';
  isSavingEdit$ = new BehaviorSubject<boolean>(false);

  // Delete confirmation state
  showDeleteConfirm = false;
  deletingWorkflow: WorkflowDto | null = null;
  isDeleting$ = new BehaviorSubject<boolean>(false);

  customerId: number | null = null;
  customerName: string = '';
  taskId: number | null = null;
  private destroy$ = new Subject<void>();
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workflowStateService: WorkflowStateService,
    private workflowService: WorkflowService
  ) {}

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.customerId = params['customerId'] ? +params['customerId'] : null;
      this.customerName = params['customerName'] || '';
      this.taskId = params['taskId'] ? +params['taskId'] : null;
      if (this.customerId) this.loadWorkflows(this.customerId);
    });

    this.loadSuppliers();

    this.productTypes$ = this.selectedSupplierSubject$.pipe(
      switchMap(supplierId => {
        if (!supplierId) return new BehaviorSubject<ProductTypeDto[]>([]);
        return this.workflowService.getAllProductTypesForSupplier(supplierId).pipe(
          catchError(() => { this.errorMessage$.next('Failed to load product types'); return new BehaviorSubject<ProductTypeDto[]>([]); })
        );
      })
    );

    this.products$ = combineLatest([this.selectedSupplierSubject$, this.selectedProductTypeSubject$]).pipe(
      switchMap(([supplierId, productTypeId]) => {
        if (!supplierId || !productTypeId) return new BehaviorSubject<ProductDto[]>([]);
        return this.workflowService.getAllProductsBySupplier(supplierId, productTypeId).pipe(
          catchError(() => { this.errorMessage$.next('Failed to load products'); return new BehaviorSubject<ProductDto[]>([]); })
        );
      })
    );

    this.workflows$ = this.workflowsSubject$.asObservable();

    this.paginatedWorkflows$ = combineLatest([this.workflows$, this.currentPage$]).pipe(
      map(([workflows, currentPage]) => {
        const start = (currentPage - 1) * this.pageSize;
        return workflows.slice(start, start + this.pageSize);
      })
    );
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSuppliers() {
    this.suppliers$ = this.workflowService.getAllSuppliers().pipe(
      tap(s => console.log('✅ Suppliers loaded:', s.length)),
      catchError(() => { this.errorMessage$.next('Failed to load suppliers.'); return new BehaviorSubject<SupplierDto[]>([]); })
    );
  }

  onSupplierChange(supplierId: number) {
    this.selectedSupplier = supplierId;
    this.selectedProductType = null;
    this.selectedProduct = null;
    this.selectedSupplierSubject$.next(supplierId);
    this.selectedProductTypeSubject$.next(null);
    this.selectedProductSubject$.next(null);
  }

  onProductTypeChange(productTypeId: number) {
    this.selectedProductType = productTypeId;
    this.selectedProduct = null;
    this.selectedProductTypeSubject$.next(productTypeId);
    this.selectedProductSubject$.next(null);
  }

  onProductChange(productId: number) {
    this.selectedProduct = productId;
    this.selectedProductSubject$.next(productId);
  }

  loadWorkflows(customerId: number) {
    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.workflowService.getWorkflowsForCustomer(customerId).pipe(
      takeUntil(this.destroy$),
      tap(w => console.log('✅ Workflows loaded:', w.length)),
      map(workflows => workflows.map(w => ({ ...w, dateAdded: new Date(w.dateAdded) }))),
      finalize(() => this.isLoading$.next(false))
    ).subscribe({
      next: (workflows) => { this.workflowsSubject$.next(workflows); this.calculateTotalPages(workflows.length); },
      error: () => this.errorMessage$.next('Failed to load workflows. Please try again.')
    });
  }

  addNewWorkflow() {
    if (!this.selectedSupplier || !this.selectedProductType || !this.selectedProduct || !this.customerId) {
      this.errorMessage$.next('Please select supplier, product type, and product');
      this.clearMessagesAfterDelay();
      return;
    }
    if (!this.newWorkflowName.trim()) {
      this.errorMessage$.next('Please enter a workflow name');
      this.clearMessagesAfterDelay();
      return;
    }

    // Snapshot current observable values synchronously
    let suppliers: SupplierDto[] = [];
    let productTypes: ProductTypeDto[] = [];
    let products: ProductDto[] = [];
    this.suppliers$.pipe(takeUntil(this.destroy$)).subscribe(s => suppliers = s);
    this.productTypes$.pipe(takeUntil(this.destroy$)).subscribe(pt => productTypes = pt);
    this.products$.pipe(takeUntil(this.destroy$)).subscribe(p => products = p);

    const supplier = suppliers.find(s => s.supplierId === this.selectedSupplier);
    const productType = productTypes.find(pt => pt.productTypeId === this.selectedProductType);
    const product = products.find(p => p.productId === this.selectedProduct);

    const dto: WorkflowDto = {
      workflowId: 0,
      workflowName: this.newWorkflowName.trim(),
      productName: product?.productName || '',
      description: this.newWorkflowDescription.trim() ||
      `${supplier?.supplierName || ''} - ${productType?.description || ''} - ${product?.productName || ''}`,
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
      productTypeId: this.selectedProductType,
      taskId: this.taskId || undefined
    };

    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.workflowService.createWorkflow(dto).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading$.next(false))
    ).subscribe({
      next: () => {
        this.successMessage$.next('Workflow created successfully!');
        this.loadWorkflows(this.customerId!);
        // Reset add form
        this.selectedSupplier = null;
        this.selectedProductType = null;
        this.selectedProduct = null;
        this.newWorkflowName = '';
        this.newWorkflowDescription = '';
        this.selectedSupplierSubject$.next(null);
        this.selectedProductTypeSubject$.next(null);
        this.selectedProductSubject$.next(null);
        this.clearMessagesAfterDelay();
      },
      error: () => this.errorMessage$.next('Failed to create workflow. Please try again.')
    });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  openEditModal(workflow: WorkflowDto, event: Event) {
    event.stopPropagation();
    this.editingWorkflow = { ...workflow };
    this.editWorkflowName = workflow.workflowName || '';
    this.editWorkflowDescription = workflow.description || '';
    this.showEditModal = true;
    this.errorMessage$.next('');
    this.successMessage$.next('');
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editingWorkflow = null;
    this.editWorkflowName = '';
    this.editWorkflowDescription = '';
  }

  saveEdit() {
    if (!this.editingWorkflow) return;
    if (!this.editWorkflowName.trim()) {
      this.errorMessage$.next('Workflow name is required');
      this.clearMessagesAfterDelay();
      return;
    }

    const updated: WorkflowDto = {
      ...this.editingWorkflow,
      workflowName: this.editWorkflowName.trim(),
      description: this.editWorkflowDescription.trim()
    };

    this.isSavingEdit$.next(true);
    this.workflowService.updateWorkflow(updated).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isSavingEdit$.next(false))
    ).subscribe({
      next: () => {
        // Update local list without a full reload
        const current = this.workflowsSubject$.value;
        const idx = current.findIndex(w => w.workflowId === updated.workflowId);
        if (idx !== -1) { current[idx] = updated; this.workflowsSubject$.next([...current]); }
        this.successMessage$.next('Workflow updated successfully!');
        this.closeEditModal();
        this.clearMessagesAfterDelay();
      },
      error: () => this.errorMessage$.next('Failed to update workflow. Please try again.')
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  openDeleteConfirm(workflow: WorkflowDto, event: Event) {
    event.stopPropagation();
    this.deletingWorkflow = workflow;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.deletingWorkflow = null;
  }

  confirmDelete() {
    if (!this.deletingWorkflow) return;
    const id = this.deletingWorkflow.workflowId;
    const name = this.deletingWorkflow.workflowName || this.deletingWorkflow.description;

    this.isDeleting$.next(true);
    this.showDeleteConfirm = false;

    this.workflowService.deleteWorkflow(id).pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.isDeleting$.next(false); this.deletingWorkflow = null; })
    ).subscribe({
      next: () => {
        const current = this.workflowsSubject$.value.filter(w => w.workflowId !== id);
        this.workflowsSubject$.next(current);
        this.calculateTotalPages(current.length);
        this.successMessage$.next(`Workflow "${name}" deleted successfully!`);
        this.clearMessagesAfterDelay();
      },
      error: () => { this.errorMessage$.next('Failed to delete workflow. Please try again.'); this.clearMessagesAfterDelay(); }
    });
  }

  // ── Stage toggle ──────────────────────────────────────────────────────────

  toggleStage(workflow: WorkflowDto, stage: string, event?: Event) {
    if (event) event.stopPropagation();
    const updatedWorkflow: WorkflowDto = { ...workflow };
    const stageMapping: { [key: string]: keyof WorkflowDto } = {
      'initialEnquiry': 'initialEnquiry',
      'createQuote': 'createQuotation',
      'inviteShowroom': 'inviteShowRoomVisit',
      'setupSiteVisit': 'setupSiteVisit',
      'invoice': 'invoiceSent'
    };
    const dtoProperty = stageMapping[stage];
    if (!dtoProperty) return;
    (updatedWorkflow as any)[dtoProperty] = !(updatedWorkflow as any)[dtoProperty];

    this.workflowService.updateWorkflow(updatedWorkflow).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        const cw = this.workflowsSubject$.value;
        const i = cw.findIndex(w => w.workflowId === workflow.workflowId);
        if (i !== -1) { cw[i] = updatedWorkflow; this.workflowsSubject$.next([...cw]); }
      },
      error: () => { this.errorMessage$.next('Failed to update workflow stage.'); this.clearMessagesAfterDelay(); }
    });
  }

  // ── Navigate ──────────────────────────────────────────────────────────────

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
        queryParams: { customerId: this.customerId, customerName: this.customerName, workflowId: workflow.workflowId }
      });
    } else {
      this.errorMessage$.next('Please enable at least one stage for this workflow');
      this.clearMessagesAfterDelay();
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  calculateTotalPages(totalItems: number) {
    this.totalPages$.next(Math.ceil(totalItems / this.pageSize) || 1);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages$.value) this.currentPage$.next(page);
  }

  previousPage() {
    if (this.currentPage$.value > 1) this.currentPage$.next(this.currentPage$.value - 1);
  }

  nextPage() {
    if (this.currentPage$.value < this.totalPages$.value) this.currentPage$.next(this.currentPage$.value + 1);
  }

  goToLastPage() { this.goToPage(this.totalPages$.value); }

  private clearMessagesAfterDelay(): void {
    setTimeout(() => { this.successMessage$.next(''); this.errorMessage$.next(''); }, 3000);
  }
}