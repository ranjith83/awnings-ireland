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
  ProductDto,
  WorkflowDeleteResult,
  WorkflowDependency
} from '../../service/workflow.service';
import {
  WorkflowStateService,
  SelectedWorkflow
} from '../../service/workflow-state.service';

/**
 * Three states for each workflow stage pill:
 *  'disabled'   – stage not enabled for this workflow   (grey ring)
 *  'pending'    – stage enabled but no activity yet     (blue ring)
 *  'completed'  – stage has real activity records       (green check)
 */
export type StageStatus = 'disabled' | 'pending' | 'completed';

import { NotificationService } from '../../service/notification.service';
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
  isLoading$      = new BehaviorSubject<boolean>(false);
  
  

  // Cascade select subjects
  private selectedSupplierSubject$    = new BehaviorSubject<number | null>(null);
  private selectedProductTypeSubject$ = new BehaviorSubject<number | null>(null);
  private selectedProductSubject$     = new BehaviorSubject<number | null>(null);

  // Pagination
  currentPage$ = new BehaviorSubject<number>(1);
  pageSize     = 10;
  totalPages$  = new BehaviorSubject<number>(1);

  // Form bindings — Add form
  selectedSupplier: number | null    = null;
  selectedProductType: number | null = null;
  selectedProduct: number | null     = null;

  // Cached current lists for synchronous lookup
  private currentSuppliers: SupplierDto[]     = [];
  private currentProductTypes: ProductTypeDto[] = [];
  private currentProducts: ProductDto[]         = [];

  // Edit modal state
  showEditModal         = false;
  editingWorkflow: WorkflowDto | null = null;
  isSavingEdit$ = new BehaviorSubject<boolean>(false);

  // Delete confirmation state
  showDeleteConfirm    = false;
  deletingWorkflow: WorkflowDto | null = null;
  isDeleting$          = new BehaviorSubject<boolean>(false);
  /** Populated when the server blocks deletion — shown in the confirmation modal. */
  blockingDependencies: WorkflowDependency[] = [];

  customerId: number | null = null;
  customerName  = '';
  customerEmail = '';
  taskId: number | null       = null;
  fromFollowUp: number | null = null;
  fromTask: number | null     = null;

  private destroy$        = new Subject<void>();
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workflowStateService: WorkflowStateService,
    private workflowService: WorkflowService,
    private notificationService: NotificationService) {}

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.customerId    = params['customerId']   ? +params['customerId']   : null;
      this.customerName  = params['customerName']  || '';
      this.customerEmail = params['customerEmail'] || '';
      this.taskId        = params['taskId']        ? +params['taskId']        : null;
      this.fromFollowUp  = params['fromFollowUp']  ? +params['fromFollowUp']  : null;
      this.fromTask      = params['fromTask']      ? +params['fromTask']      : null;
      if (this.customerId) this.loadWorkflows(this.customerId);
    });

    this.loadSuppliers();

    this.productTypes$ = this.selectedSupplierSubject$.pipe(
      switchMap(supplierId => {
        if (!supplierId) return new BehaviorSubject<ProductTypeDto[]>([]);
        return this.workflowService.getAllProductTypesForSupplier(supplierId).pipe(
          catchError(() => { this.notificationService.error('Failed to load product types'); return new BehaviorSubject<ProductTypeDto[]>([]); })
        );
      })
    );

    this.products$ = combineLatest([this.selectedSupplierSubject$, this.selectedProductTypeSubject$]).pipe(
      switchMap(([supplierId, productTypeId]) => {
        if (!supplierId || !productTypeId) return new BehaviorSubject<ProductDto[]>([]);
        return this.workflowService.getAllProductsBySupplier(supplierId, productTypeId).pipe(
          catchError(() => { this.notificationService.error('Failed to load products'); return new BehaviorSubject<ProductDto[]>([]); })
        );
      })
    );

    this.suppliers$.pipe(takeUntil(this.destroy$)).subscribe(s => this.currentSuppliers = s);
    this.productTypes$.pipe(takeUntil(this.destroy$)).subscribe(pt => this.currentProductTypes = pt);
    this.products$.pipe(takeUntil(this.destroy$)).subscribe(p => this.currentProducts = p);

    this.workflows$ = this.workflowsSubject$.asObservable();

    this.paginatedWorkflows$ = combineLatest([this.workflows$, this.currentPage$]).pipe(
      map(([workflows, currentPage]) => {
        const start = (currentPage - 1) * this.pageSize;
        return workflows.slice(start, start + this.pageSize);
      })
    );
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  // ── Loaders ───────────────────────────────────────────────────────────────

  loadSuppliers() {
    this.suppliers$ = this.workflowService.getAllSuppliers().pipe(
      catchError(() => { this.notificationService.error('Failed to load suppliers.'); return new BehaviorSubject<SupplierDto[]>([]); })
    );
  }

  loadWorkflows(customerId: number) {
    this.isLoading$.next(true);
    this.notificationService.error('');
    this.workflowService.getWorkflowsForCustomer(customerId).pipe(
      takeUntil(this.destroy$),
      map(workflows => workflows.map(w => ({ ...w, dateAdded: new Date(w.dateAdded) }))),
      finalize(() => this.isLoading$.next(false))
    ).subscribe({
      next: (workflows) => { this.workflowsSubject$.next(workflows); this.calculateTotalPages(workflows.length); },
      error: () => this.notificationService.error('Failed to load workflows. Please try again.')
    });
  }

  // ── Cascade select handlers ───────────────────────────────────────────────

  onSupplierChange(supplierId: number) {
    this.selectedSupplier     = supplierId;
    this.selectedProductType  = null;
    this.selectedProduct      = null;
    this.selectedSupplierSubject$.next(supplierId);
    this.selectedProductTypeSubject$.next(null);
    this.selectedProductSubject$.next(null);
  }

  onProductTypeChange(productTypeId: number) {
    this.selectedProductType = productTypeId;
    this.selectedProduct     = null;
    this.selectedProductTypeSubject$.next(productTypeId);
    this.selectedProductSubject$.next(null);
  }

  onProductChange(productId: number) {
    this.selectedProduct = productId;
    this.selectedProductSubject$.next(productId);
  }

  // ── Stage status helpers ──────────────────────────────────────────────────

  /**
   * Returns the three-way status for a stage:
   *  'disabled'  — the stage flag is not enabled
   *  'completed' — enabled AND the server confirmed real activity exists
   *  'pending'   — enabled but no activity yet
   */
  stageStatus(enabled: boolean, completed: boolean): StageStatus {
    if (!enabled)   return 'disabled';
    if (completed)  return 'completed';
    return 'pending';
  }

  /** CSS class applied to the stage pill button. */
  stageCssClass(status: StageStatus): string {
    return `stage-btn stage-btn--${status}`;
  }

  /** Tooltip text for each state. */
  stageTooltip(label: string, status: StageStatus): string {
    if (status === 'disabled')  return `${label}: Not enabled`;
    if (status === 'completed') return `${label}: Completed ✓`;
    return `${label}: In progress`;
  }

  // ── Add workflow ──────────────────────────────────────────────────────────

  addNewWorkflow() {
    if (!this.selectedSupplier || !this.selectedProductType || !this.selectedProduct || !this.customerId) {
      this.notificationService.error('Please select supplier, product type, and product');
      this.clearMessagesAfterDelay(); return;
    }

    const supplier    = this.currentSuppliers.find(s => s.supplierId === this.selectedSupplier);
    const productType = this.currentProductTypes.find(pt => pt.productTypeId === this.selectedProductType);
    const product     = this.currentProducts.find(p => p.productId === this.selectedProduct);

    // Duplicate check — same supplier + productType + product for this customer
    const existing = this.workflowsSubject$.value;
    const isDuplicate = existing.some(w =>
      w.supplierId    === this.selectedSupplier &&
      w.productTypeId === this.selectedProductType &&
      w.productId     === this.selectedProduct
    );
    if (isDuplicate) {
      this.notificationService.error(
        `A workflow for "${productType?.description || ''} - ${product?.productName || ''}" already exists for this customer.`
      );
      this.clearMessagesAfterDelay(); return;
    }

    const autoName = `${productType?.description || ''} - ${product?.productName || ''}`.trim();

    const dto: WorkflowDto = {
      workflowId: 0,
      workflowName: autoName,
      productName: product?.productName || '',
      description: `${supplier?.supplierName || ''} - ${productType?.description || ''} - ${product?.productName || ''}`,
      initialEnquiry: false, createQuotation: false,
      inviteShowRoomVisit: false, setupSiteVisit: false, invoiceSent: false,
      initialEnquiryCompleted: false, createQuotationCompleted: false,
      inviteShowRoomCompleted: false, setupSiteVisitCompleted: false, invoiceSentCompleted: false,
      dateAdded: new Date().toISOString(),
      addedBy: 'Current User',
      customerId: this.customerId,
      supplierId: this.selectedSupplier,
      productId: this.selectedProduct,
      productTypeId: this.selectedProductType,
      companyId: 0,
      taskId: this.taskId || undefined,
      hasDependencies: false
    };

    this.isLoading$.next(true);
    this.workflowService.createWorkflow(dto).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading$.next(false))
    ).subscribe({
      next: () => {
        this.notificationService.success('Workflow created successfully!');
        this.loadWorkflows(this.customerId!);
        this.selectedSupplier = null; this.selectedProductType = null; this.selectedProduct = null;
        this.selectedSupplierSubject$.next(null); this.selectedProductTypeSubject$.next(null); this.selectedProductSubject$.next(null);
        this.clearMessagesAfterDelay();
      },
      error: () => this.notificationService.error('Failed to create workflow. Please try again.')
    });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  openEditModal(workflow: WorkflowDto, event: Event) {
    event.stopPropagation();
    this.editingWorkflow = { ...workflow };
    this.showEditModal   = true;
    this.notificationService.error(''); this.notificationService.success('');
  }

  closeEditModal() {
    this.showEditModal = false; this.editingWorkflow = null;
  }

  saveEdit() {
    if (!this.editingWorkflow) return;
    const updated: WorkflowDto = { ...this.editingWorkflow };

    this.isSavingEdit$.next(true);
    this.workflowService.updateWorkflow(updated).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isSavingEdit$.next(false))
    ).subscribe({
      next: () => {
        const current = this.workflowsSubject$.value;
        const idx = current.findIndex(w => w.workflowId === updated.workflowId);
        if (idx !== -1) { current[idx] = updated; this.workflowsSubject$.next([...current]); }
        this.notificationService.success('Workflow updated successfully!');
        this.closeEditModal(); this.clearMessagesAfterDelay();
      },
      error: () => this.notificationService.error('Failed to update workflow. Please try again.')
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  openDeleteConfirm(workflow: WorkflowDto, event: Event) {
    event.stopPropagation();
    // If the workflow already has known dependencies (from the list data),
    // open in "blocked" mode immediately without hitting the API
    this.deletingWorkflow    = workflow;
    this.blockingDependencies = [];   // clear any previous state
    this.showDeleteConfirm   = true;
  }

  /** True when the workflow in the confirmation modal has known dependencies. */
  get deleteIsBlocked(): boolean {
    return !!this.deletingWorkflow?.hasDependencies;
  }

  cancelDelete() {
    this.showDeleteConfirm    = false;
    this.deletingWorkflow     = null;
    this.blockingDependencies = [];
  }

  confirmDelete() {
    if (!this.deletingWorkflow) return;

    // Guard: never submit the request if dependencies are known
    if (this.deletingWorkflow.hasDependencies) return;

    const id   = this.deletingWorkflow.workflowId;
    const name = this.deletingWorkflow.workflowName || this.deletingWorkflow.description;

    this.isDeleting$.next(true);
    this.workflowService.deleteWorkflow(id).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isDeleting$.next(false))
    ).subscribe({
      next: (result: WorkflowDeleteResult) => {
        if (result.deleted) {
          // Success — remove from local list
          const current = this.workflowsSubject$.value.filter(w => w.workflowId !== id);
          this.workflowsSubject$.next(current);
          this.calculateTotalPages(current.length);
          this.showDeleteConfirm = false;
          this.deletingWorkflow  = null;
          this.blockingDependencies = [];
          this.notificationService.success(`Workflow "${name}" deleted successfully!`);
          this.clearMessagesAfterDelay();
        } else {
          // Blocked — update the workflow in the local list so the icon refreshes,
          // and show the dependency list inside the still-open modal.
          this.blockingDependencies = result.blockingDependencies;
          // Mark hasDependencies = true so the button stays locked on the list
          const cw = this.workflowsSubject$.value;
          const idx = cw.findIndex(w => w.workflowId === id);
          if (idx !== -1) {
            cw[idx] = { ...cw[idx], hasDependencies: true };
            this.workflowsSubject$.next([...cw]);
          }
        }
      },
      error: () => {
        this.notificationService.error('Failed to delete workflow. Please try again.');
        this.showDeleteConfirm = false;
        this.deletingWorkflow  = null;
        this.clearMessagesAfterDelay();
      }
    });
  }

  /** Returns an icon character for each dependency name. */
  depIcon(name: string): string {
    if (name.toLowerCase().includes('enquiry'))  return '✉';
    if (name.toLowerCase().includes('quote'))    return '📄';
    if (name.toLowerCase().includes('showroom')) return '🏠';
    if (name.toLowerCase().includes('site'))     return '📍';
    if (name.toLowerCase().includes('invoice'))  return '💶';
    return '•';
  }

  // ── Stage toggle (enabled flag only — completed is server-computed) ───────

  toggleStage(workflow: WorkflowDto, stage: string, event?: Event) {
    if (event) event.stopPropagation();
    const updatedWorkflow: WorkflowDto = { ...workflow };
    const stageMapping: { [key: string]: keyof WorkflowDto } = {
      'initialEnquiry':  'initialEnquiry',
      'createQuote':     'createQuotation',
      'inviteShowroom':  'inviteShowRoomVisit',
      'setupSiteVisit':  'setupSiteVisit',
      'finalQuote':      'finalQuote',
      'invoice':         'invoiceSent'
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
      error: () => { this.notificationService.error('Failed to update workflow stage.'); this.clearMessagesAfterDelay(); }
    });
  }

  // ── Navigate on row click ─────────────────────────────────────────────────

  selectWorkflow(workflow: WorkflowDto) {
    const selected: SelectedWorkflow = {
      id: workflow.workflowId, productId: workflow.productId,
      product: workflow.productName, description: workflow.description,
      stages: {
        initialEnquiry:  workflow.initialEnquiry,
        createQuote:     workflow.createQuotation,
        inviteShowroom:  workflow.inviteShowRoomVisit,
        setupSiteVisit:  workflow.setupSiteVisit,
        finalQuote:      workflow.finalQuote || false,
        invoice:         workflow.invoiceSent
      },
      customerId: this.customerId || undefined,
      customerName: this.customerName
    };
    this.workflowStateService.setSelectedWorkflow(selected);
    const enabledStages = this.workflowStateService.getEnabledStages();
    if (enabledStages.length > 0) {
      const qp: Record<string, any> = {
        customerId: this.customerId, customerName: this.customerName, workflowId: workflow.workflowId
      };
      if (this.customerEmail) qp['customerEmail'] = this.customerEmail;
      if (this.taskId)        qp['taskId']        = this.taskId;
      if (this.fromFollowUp)  qp['fromFollowUp']  = this.fromFollowUp;
      if (this.fromTask)      qp['fromTask']      = this.fromTask;
      this.router.navigate([`/workflow/${enabledStages[0]}`], { queryParams: qp });
    } else {
      this.notificationService.error('Please enable at least one stage for this workflow');
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

  previousPage() { if (this.currentPage$.value > 1) this.currentPage$.next(this.currentPage$.value - 1); }
  nextPage()     { if (this.currentPage$.value < this.totalPages$.value) this.currentPage$.next(this.currentPage$.value + 1); }
  goToLastPage() { this.goToPage(this.totalPages$.value); }

  private clearMessagesAfterDelay(): void {
    setTimeout(() => { this.notificationService.success(''); this.notificationService.error(''); }, 3000);
  }
}