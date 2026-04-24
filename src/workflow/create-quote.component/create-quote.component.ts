import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BehaviorSubject, Observable, Subject, combineLatest,
  takeUntil, tap, catchError, of, finalize
} from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import {
  CreateQuoteService,
  CreateQuoteDto,
  QuoteDto,
  UpdateQuoteDto,
  UpdateQuoteItemDto,
  ProductItemType,
} from '../../service/create-quote.service';
import {
  WorkflowService,
  SupplierDto,
  WorkflowDto,
  MotorDto,
  HeaterDto,
  BracketDto,
  LightingCassetteDto,
  ControlDto
} from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';
import { EmailTaskService, SendDirectEmailPayload, EmailAttachmentPayload } from '../../service/email-task.service';

interface QuoteItemDisplay {
  id?: number;            // client-side marker for addon slot management
  productItemId?: number; // matches ProductItems.Id in the backend DB
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  amount: number;
}

import { NotificationService } from '../../service/notification.service';
@Component({
  selector: 'app-create-quote.component',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-quote.component.html',
  styleUrl: './create-quote.component.css'
})
export class CreateQuoteComponent implements OnInit, OnDestroy {

  // ── Observables ────────────────────────────────────────────────────────────
  workflows$!: Observable<WorkflowDto[]>;
  suppliers$!: Observable<SupplierDto[]>;
  brackets$!: Observable<BracketDto[]>;
  uniqueBrackets$!: Observable<BracketDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
  lightingCassettes$!: Observable<LightingCassetteDto[]>;
  controls$!: Observable<ControlDto[]>;
  availableWidths$!: Observable<number[]>;
  availableProjections$!: Observable<number[]>;
  quoteItems$!: Observable<QuoteItemDisplay[]>;
  subtotal$!: Observable<number>;
  quoteDiscount$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  isFormValid$!: Observable<boolean>;

  // ── State subjects ─────────────────────────────────────────────────────────
  isLoading$         = new BehaviorSubject<boolean>(false);
  isLoadingQuotes$   = new BehaviorSubject<boolean>(false);
  isSendingEmail$    = new BehaviorSubject<boolean>(false);
  
  

  private draftQuotesSubject$ = new BehaviorSubject<QuoteDto[]>([]);
  private finalQuotesSubject$ = new BehaviorSubject<QuoteDto[]>([]);
  draftQuotes$!: Observable<QuoteDto[]>;

  // ── Edit state ─────────────────────────────────────────────────────────────
  editingQuote: QuoteDto | null = null;

  private workflowsSubject$          = new BehaviorSubject<WorkflowDto[]>([]);
  private suppliersSubject$          = new BehaviorSubject<SupplierDto[]>([]);
  private bracketsSubject$           = new BehaviorSubject<BracketDto[]>([]);
  private motorsSubject$             = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$            = new BehaviorSubject<HeaterDto[]>([]);
  private lightingCassettesSubject$  = new BehaviorSubject<LightingCassetteDto[]>([]);
  private controlsSubject$           = new BehaviorSubject<ControlDto[]>([]);
  private widthsSubject$      = new BehaviorSubject<number[]>([]);
  private projectionsSubject$ = new BehaviorSubject<number[]>([]);
  private quoteItemsSubject$  = new BehaviorSubject<QuoteItemDisplay[]>([]);

  // ── Customer / workflow context ────────────────────────────────────────────
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName       = '';
  customerEmail      = '';   // ← populated from route params
  customerAddress    = '';
  customerCity       = '';
  customerPostalCode = '';

  // ── Selection bindings ─────────────────────────────────────────────────────
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null    = null;
  /** The raw value the user typed in the width text box (cm). Used for display in line item. */
  enteredWidthCm: number | null     = null;
  /** The resolved standard-width ceiling used for pricing lookups. */
  selectedWidthCm: number | null    = null;
  selectedAwning: number | null     = null;
  selectedProductName               = '';

  // ── Quote metadata ─────────────────────────────────────────────────────────
  quoteDate    = new Date().toISOString().split('T')[0];
  followUpDate = this.getDefaultFollowUpDate();
  notes        = '';
  terms        = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';

  // ── Discount (optional) ────────────────────────────────────────────────────
  /** '' | 'Percentage' | 'Fixed'  — empty means no discount */
  discountType  = '';
  discountValue = 0;

  // Brackets dropdown open state
  bracketDropdownOpen = false;

  toggleBracketDropdown() { this.bracketDropdownOpen = !this.bracketDropdownOpen; }

  closeBracketDropdown() { this.bracketDropdownOpen = false; }

  isBracketSelected(bracketName: string): boolean {
    return this.selectedBrackets.includes(bracketName);
  }

  toggleBracket(bracketName: string) {
    const idx = this.selectedBrackets.indexOf(bracketName);
    if (idx === -1) this.selectedBrackets = [...this.selectedBrackets, bracketName];
    else            this.selectedBrackets = this.selectedBrackets.filter(b => b !== bracketName);
    this.onBracketChange();
  }

  getBracketLabel(): string {
    if (!this.selectedBrackets.length) return 'Select brackets';
    if (this.selectedBrackets.length === 1) return this.selectedBrackets[0];
    return `${this.selectedBrackets.length} brackets selected`;
  }

  // ── Addon selections ───────────────────────────────────────────────────────
  installationFee     = 0;
  vatRate             = 13.5;
  selectedBrackets    : string[] = [];
  selectedMotor              = '';
  selectedHeater             = '';
  selectedLightingCassette   = '';
  selectedControl            = '';
  includeElectrician  = false;
  electricianPrice    = 280.00;

  // RAL surcharge — price fetched from API based on productId + ceiling width
  includeRalSurcharge  = false;

  // Shadeplus — loaded once per product; options list covers all widths
  includeShadeplus  = false;
  /** All rows returned by the API — one per (description × widthCm) combination.
   *  Used for price lookup when the user enters a width. */
  shadePlusAllRows: { shadePlusId: number; description: string; widthCm: number; price: number }[] = [];
  /** Deduplicated by description — drives the dropdown. */
  shadePlusOptions: { shadePlusId: number; description: string; price: number }[] = [];
  shadePlusHasMultiple  = false;
  /** The shadePlusId of the row the user has chosen in the dropdown. */
  selectedShadePlusId: number | null = null;
  /** Editable description — becomes the line item description. */
  selectedShadePlusDescription = '';

  // Valance Style — price fetched from API based on productId + ceiling width
  includeValanceStyle  = false;

  // Wall Sealing Profile — price fetched from API based on productId + ceiling width
  includeWallSealing  = false;

  // ── Addon availability flags (set after workflow/product selected) ──────────
  hasRalSurcharge    = false;
  hasShadePlus       = false;
  hasValanceStyle    = false;
  hasWallSealing     = false;

  // Extras (free-text line item)
  extrasDescription = '';
  extrasPrice       = 0;

  /**
   * When true the quote PDF is emailed to the customer address via Graph.
   * The email is sent using the linked task's send-email endpoint.
   */
  emailToCustomer = false;

  calculatedPrice = 0;
  pageSize        = 10;

  private destroy$ = new Subject<void>();

  constructor(
    private createQuoteService: CreateQuoteService,
    private workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService,
    private pdfService: PdfGenerationService,
    private emailTaskService: EmailTaskService,
    private route: ActivatedRoute,
    private router: Router,
    private notificationService: NotificationService) {}

  ngOnInit() {
    this.initializeObservables();
    this.initializeComponent();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      this.bracketDropdownOpen = false;
    }
  }

  // ── Observable setup ───────────────────────────────────────────────────────

  private initializeObservables() {
    this.workflows$           = this.workflowsSubject$.asObservable();
    this.suppliers$           = this.suppliersSubject$.asObservable();
    this.brackets$            = this.bracketsSubject$.asObservable();
    this.uniqueBrackets$      = this.brackets$.pipe(
      map(brackets => {
        const seen = new Set<string>();
        return brackets.filter(b => {
          if (seen.has(b.bracketName)) return false;
          seen.add(b.bracketName);
          return true;
        });
      })
    );
    this.motors$              = this.motorsSubject$.asObservable();
    this.heaters$             = this.heatersSubject$.asObservable();
    this.lightingCassettes$   = this.lightingCassettesSubject$.asObservable();
    this.controls$            = this.controlsSubject$.asObservable();
    this.availableWidths$     = this.widthsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.quoteItems$          = this.quoteItemsSubject$.asObservable();
    this.draftQuotes$         = this.draftQuotesSubject$.asObservable();

    this.subtotal$ = this.quoteItems$.pipe(
      map(items => items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0))
    );

    this.quoteDiscount$ = this.subtotal$.pipe(
      map(subtotal => {
        if (!this.discountType || this.discountValue <= 0) return 0;
        if (this.discountType === 'Percentage') return subtotal * (this.discountValue / 100);
        if (this.discountType === 'Fixed')      return this.discountValue;
        return 0;
      })
    );

    this.totalTax$ = combineLatest([this.quoteItems$, this.quoteDiscount$, this.subtotal$]).pipe(
      map(([items, quoteDiscount, subtotal]) => {
        const itemLevelTax = items.reduce((sum, item) => {
          const disc = item?.discountPercentage || 0;
          const tax  = item?.taxRate            || 0;
          const sub  = item.quantity * item.unitPrice;
          return sum + ((sub - sub * (disc / 100)) * (tax / 100));
        }, 0);

        const itemLevelDiscount = items.reduce((sum, i) =>
          sum + (i.quantity * i.unitPrice * (i.discountPercentage / 100)), 0);
        const afterItemDisc = subtotal - itemLevelDiscount;

        if (quoteDiscount > 0 && afterItemDisc > 0) {
          return itemLevelTax * (1 - quoteDiscount / afterItemDisc);
        }
        return itemLevelTax;
      })
    );

    this.totalAmount$ = combineLatest([
      this.subtotal$, this.quoteDiscount$, this.totalTax$, this.quoteItems$
    ]).pipe(
      map(([subtotal, quoteDiscount, tax, items]) => {
        const itemLevelDiscount = items.reduce((sum, i) =>
          sum + (i.quantity * i.unitPrice * (i.discountPercentage / 100)), 0);
        return subtotal - itemLevelDiscount - quoteDiscount + tax;
      })
    );

    this.isFormValid$ = this.quoteItems$.pipe(
      map(items => {
        if (!this.workflowId || !this.customerId) return false;
        if (items.length === 0) return false;
        return items.every(item =>
          item.description.trim() !== '' && item.quantity > 0 && item.unitPrice >= 0
        );
      })
    );
  }

  // ── Component init ─────────────────────────────────────────────────────────

  private initializeComponent() {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId        = params['customerId']        ? +params['customerId']        : null;
        this.customerName      = params['customerName']      || '';
        this.customerEmail     = params['customerEmail']     || '';   // ← read email from route
        this.customerAddress   = params['customerAddress']   || '';
        this.customerCity      = params['customerCity']      || '';
        this.customerPostalCode = params['customerPostalCode'] || '';

        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        let workflowId = 0;

        if (!this.customerId) {
          this.notificationService.error('No customer selected. Please select a customer first.');
          return;
        }

        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        this.customerId    = selectedWorkflow?.customerId    || this.customerId;
        this.customerName  = selectedWorkflow?.customerName  || this.customerName;
        workflowId         = selectedWorkflow?.id            || paramWorkflowId || 0;

        this.loadWorkflowsForCustomer(workflowId);
        this.loadSuppliers();

        // customerEmail is resolved from route params above.
        // If not present, fall back to fetching from any linked task's fromEmail.
        if (this.customerId && !this.customerEmail) this.resolveCustomerEmail(this.customerId);
      });
  }

  /**
   * Fallback: if customerEmail wasn't in the route params, fetch it from the
   * first linked email task for this customer.  sendDirectEmail() doesn't need
   * a taskId — it uses the email address directly — so we only need the address.
   */
  private resolveCustomerEmail(customerId: number) {
    this.emailTaskService.getTasksByCustomer(customerId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(tasks => {
        if (tasks.length && tasks[0].fromEmail) {
          this.customerEmail = tasks[0].fromEmail;
        }
      });
  }

  // ── Loaders ────────────────────────────────────────────────────────────────

  private loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(takeUntil(this.destroy$),
        tap(s => this.suppliersSubject$.next(s)),
        catchError(() => { this.notificationService.error('Failed to load suppliers'); return of([]); }))
      .subscribe();
  }

  private loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null) {
    if (!this.customerId) return;
    this.isLoading$.next(true);
    this.workflowService.getWorkflowsForCustomer(this.customerId)
      .pipe(
        takeUntil(this.destroy$),
        tap(workflows => {
          this.workflowsSubject$.next(workflows);
          if (preselectedWorkflowId && workflows.some(w => w.workflowId === preselectedWorkflowId)) {
            this.selectedWorkflowId = preselectedWorkflowId;
            this.workflowId = preselectedWorkflowId;
            this.onWorkflowChange();
          } else if (workflows.length === 1) {
            this.selectedWorkflowId = workflows[0].workflowId;
            this.workflowId = workflows[0].workflowId;
            this.onWorkflowChange();
          }
        }),
        catchError(() => { this.notificationService.error('Failed to load workflows'); return of([]); }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  // ── Workflow / product change handlers ─────────────────────────────────────

  onWorkflowChange() {
    if (!this.selectedWorkflowId) return;
    this.workflowId = this.selectedWorkflowId;
    const wf = this.workflowsSubject$.value.find(w => w.workflowId == this.selectedWorkflowId);
    if (wf) {
      this.selectedSupplierId  = wf.supplierId;
      this.selectedModelId     = wf.productId;
      this.selectedProductName = wf.productName;
      this.loadProductWidthsAndProjections();
      this.loadProductAddons();
      this.loadExistingQuotes(wf.workflowId);
    }
  }

  private loadProductAddons() {
    if (!this.selectedModelId) return;
    const id = this.selectedModelId;

    // Reset availability flags so stale checkboxes from a prior product don't linger
    this.hasRalSurcharge = false;
    this.hasShadePlus    = false;
    this.hasValanceStyle = false;
    this.hasWallSealing  = false;
    this.shadePlusOptions = [];
    this.shadePlusAllRows = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeShadeplus = false;
    this.removeAddonLineItem('shadeplus');

    // Check which optional addons exist for this product
    this.workflowService.hasNonStandardRALColours(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.hasRalSurcharge = v);

    // ── ShadePlus: ONE call at product level — returns ALL rows (all widths) ──
    // shadePlusAllRows holds every row for price lookup by description + widthCm.
    // shadePlusOptions is deduplicated by description and drives the dropdown.
    this.workflowService.getShadePlusOptions(id, 0)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of({ hasMultiple: false, options: [] }))
      )
      .subscribe(result => {
        const opts = result.options ?? [];
        this.hasShadePlus         = opts.length > 0;
        this.shadePlusHasMultiple = result.hasMultiple;
        // Keep all rows for width-based price lookup
        this.shadePlusAllRows = opts.map(o => ({
          shadePlusId: o.shadePlusId,
          description: o.description ?? '',
          widthCm: (o as any).widthCm ?? 0,
          price: o.price
        }));
        // Deduplicate by description for the dropdown
        const seen = new Set<string>();
        this.shadePlusOptions = opts
          .filter(o => {
            const key = o.description ?? '';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(o => ({
            shadePlusId: o.shadePlusId,
            description: o.description ?? '',
            price: o.price
          }));
        // Pre-select the first option so the dropdown has a valid initial value
        if (this.shadePlusOptions.length > 0) {
          this.selectedShadePlusId = this.shadePlusOptions[0].shadePlusId;
          this.selectedShadePlusDescription = this.shadePlusOptions[0].description;
        }
      });

    this.workflowService.hasValanceStyles(id).pipe(takeUntil(this.destroy$)).subscribe(v => this.hasValanceStyle = v);
    this.workflowService.hasWallSealingProfiles(id).pipe(takeUntil(this.destroy$)).subscribe(v => this.hasWallSealing = v);

    // Brackets + motors both depend on armTypeId — load with default armTypeId 1 initially
    this.reloadArmTypeDependents();
    this.workflowService.getHeatersForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.heatersSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getLightingCassettesForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.lightingCassettesSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getControlsForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.controlsSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedModelId) return;
    const id = this.selectedModelId;
    this.workflowService.getStandardWidthsForProduct(id).pipe(takeUntil(this.destroy$), map(w => w.sort((a, b) => a - b)), tap(v => this.widthsSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getProjectionWidthsForProduct(id).pipe(takeUntil(this.destroy$), map(p => p.sort((a, b) => a - b)), tap(v => this.projectionsSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  private reloadArmTypeDependents() {
    if (!this.selectedModelId) return;
    const productId = this.selectedModelId;

    if (this.selectedWidthCm && this.selectedAwning) {
      // Both dimensions known — filter by resolved arm type
      this.workflowService.getArmTypeForProjection(productId, this.selectedWidthCm, this.selectedAwning)
        .pipe(
          takeUntil(this.destroy$),
          tap(armTypeId => {
            this.workflowService.getBracketsForProduct(productId, armTypeId)
              .pipe(
                takeUntil(this.destroy$),
                tap(brackets => { this.bracketsSubject$.next(brackets); this.onBracketChange(); }),
                catchError(() => of([]))
              ).subscribe();

            this.workflowService.getMotorsForProduct(productId, armTypeId)
              .pipe(
                takeUntil(this.destroy$),
                tap(motors => {
                  this.motorsSubject$.next(motors);
                  if (this.selectedMotor && !motors.some(m => m.motorId.toString() === this.selectedMotor)) {
                    this.selectedMotor = '';
                    this.onMotorChange();
                  }
                }),
                catchError(() => of([]))
              ).subscribe();
          }),
          catchError(() => of(null))
        ).subscribe();
    } else {
      // No dimensions yet — default to armTypeId 1
      this.workflowService.getBracketsForProduct(productId, 1)
        .pipe(
          takeUntil(this.destroy$),
          tap(brackets => {
            this.bracketsSubject$.next(brackets);
            if (this.selectedBrackets.length === 0) {
              const defaultBracket = brackets.find(b =>
                b.bracketName.toLowerCase().includes('surcharge for face fixture') &&
                !b.bracketName.toLowerCase().includes('spreader')
              );
              if (defaultBracket) {
                this.selectedBrackets = [defaultBracket.bracketName];
                this.onBracketChange();
              }
            } else {
              this.onBracketChange();
            }
          }),
          catchError(() => of([]))
        ).subscribe();

      this.workflowService.getMotorsForProduct(productId, 1)
        .pipe(
          takeUntil(this.destroy$),
          tap(motors => {
            this.motorsSubject$.next(motors);
            if (!this.selectedMotor) {
              const defaultMotor = motors.find(m =>
                m.description.toLowerCase().includes('radio') &&
                m.description.toLowerCase().includes('rts') &&
                m.description.toLowerCase().includes('1 ch')
              );
              if (defaultMotor) {
                this.selectedMotor = defaultMotor.motorId.toString();
                this.onMotorChange();
              }
            }
          }),
          catchError(() => of([]))
        ).subscribe();
    }
  }

  // ── Dimension / addon handlers ─────────────────────────────────────────────

  onWidthInput() {
    // Resolve the entered value to the floor standard-width tier
    this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
    if (this.includeRalSurcharge) this.onRalSurchargeChange();
    // ShadePlus: options are already loaded at product level — no re-fetch needed.
    // If ShadePlus is already checked, refresh the line item price for the new width.
    if (this.includeShadeplus) this.onShadeplusChange();
    if (this.includeValanceStyle) this.onValanceStyleChange();
    if (this.includeWallSealing)  this.onWallSealingChange();
  }

  /** Returns the largest standard width <= enteredWidthCm (floor/tier pricing).
   *  e.g. entered 256 with standards [250,300,350] → 250 tier → price 4639.
   *  Falls back to the smallest standard width if entered is below all standards. */
  private resolveCeilingWidth(entered: number | null): number | null {
    if (!entered || entered <= 0) return null;
    const widths = this.widthsSubject$.value;
    if (!widths.length) return null;
    const sorted = [...widths].sort((a, b) => a - b);
    // Find largest standard width that is <= entered
    const floor = [...sorted].reverse().find(w => w <= entered);
    if (floor != null) return floor;
    // Entered is below all standard widths — use the smallest
    return sorted[0];
  }

  onAwningChange() {
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
  }

  private checkAndGenerateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedWidthCm || !this.selectedAwning || !this.selectedModelId) return;
    const productId = this.selectedModelId;
    const widthcm   = this.selectedWidthCm;
    const projcm    = this.selectedAwning;

    this.workflowService.getProjectionPriceForProduct(productId, widthcm, projcm)
      .pipe(takeUntil(this.destroy$), tap(price => { this.calculatedPrice = price; this.generateFirstLineItem(); }), catchError(() => { this.notificationService.error('Failed to get price'); return of(0); }))
      .subscribe();
  }

  private generateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedAwning || !this.selectedProductName) return;
    // Display uses the actual entered value; pricing uses the ceiling width
    const widthM      = (this.enteredWidthCm / 100).toFixed(2).replace(/\.?0+$/, '') + 'm';
    const projectionM = (this.selectedAwning  / 100).toFixed(0) + 'm';
    const suffix      = (this.installationFee && this.installationFee > 0) ? 'Supply & Fit' : 'Supply Only';
    const description = `${this.selectedProductName} closed cassette awning ${widthM} wide x ${projectionM} projection ${suffix}`;
    const unitPrice   = this.calculatedPrice + (this.installationFee || 0);
    const item: QuoteItemDisplay = {
      description, quantity: 1, unitPrice,
      taxRate: this.vatRate, discountPercentage: 0,
      amount: this.calculateAmount(1, unitPrice, this.vatRate, 0)
    };
    const current = this.quoteItemsSubject$.value;
    if (current.length > 0 && current[0].description.includes('wide x')) {
      current[0] = item; this.quoteItemsSubject$.next([...current]);
    } else {
      this.quoteItemsSubject$.next([item, ...current]);
    }
  }

  onBracketChange() {
    this.removeAddonLineItem('bracket');
    if (!this.selectedBrackets || this.selectedBrackets.length === 0) return;

    // Look up by name in the current (arm-type-filtered) bracket list for correct prices
    const allBrackets = this.bracketsSubject$.value;
    const seen = new Set<string>();
    const selected = allBrackets.filter(b => {
      if (!this.selectedBrackets.includes(b.bracketName)) return false;
      if (seen.has(b.bracketName)) return false;
      seen.add(b.bracketName);
      return true;
    });

    if (selected.length === 0) return;

    if (selected.length === 1) {
      const b = selected[0];
      this.addOrUpdateAddonLineItem('bracket', {
        description: b.bracketName, quantity: 1, unitPrice: b.price,
        taxRate: this.vatRate, discountPercentage: 0,
        amount: this.calculateAmount(1, b.price, this.vatRate, 0),
        id: this.getAddonItemId('bracket')
      });
    } else {
      const combinedDesc = selected.map(b => b.bracketName).join(' + ');
      const combinedPrice = selected.reduce((sum, b) => sum + b.price, 0);
      this.addOrUpdateAddonLineItem('bracket', {
        description: combinedDesc, quantity: 1, unitPrice: combinedPrice,
        taxRate: this.vatRate, discountPercentage: 0,
        amount: this.calculateAmount(1, combinedPrice, this.vatRate, 0),
        id: this.getAddonItemId('bracket')
      });
    }
  }

  onExtrasChange() {
    if (!this.extrasDescription || this.extrasPrice <= 0) {
      this.removeAddonLineItem('arm');
      return;
    }
    this.addOrUpdateAddonLineItem('arm', {
      description: this.extrasDescription,
      quantity: 1,
      unitPrice: this.extrasPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: this.calculateAmount(1, this.extrasPrice, this.vatRate, 0),
      id: this.getAddonItemId('arm')
    });
  }

  onRalSurchargeChange() {
    if (!this.includeRalSurcharge) { this.removeAddonLineItem('ral'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getNonStandardRALColourPrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        this.addOrUpdateAddonLineItem('ral', {
          description: 'Surcharge for non-standard RAL colors',
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          amount: this.calculateAmount(1, price, this.vatRate, 0),
          id: this.getAddonItemId('ral')
        });
      });
  }

  onShadeplusChange() {
    if (!this.includeShadeplus) { this.removeAddonLineItem('shadeplus'); return; }
    if (!this.selectedModelId)  return;
    if (this.shadePlusOptions.length === 0) return;

    // Resolve which option applies
    const chosen = this.shadePlusOptions.find(
      o => o.shadePlusId === this.selectedShadePlusId
    ) ?? this.shadePlusOptions[0];

    if (!chosen) return;

    // Sync selectedShadePlusId in case we fell back to first option
    this.selectedShadePlusId = chosen.shadePlusId;
    this.selectedShadePlusDescription = chosen.description;

    // Req 4: single option → line item description is always "ShadePlus"
    // Multiple options → line item description is the chosen option's description
    const lineDesc = this.shadePlusHasMultiple ? chosen.description : 'ShadePlus';

    const addItem = (price: number) => {
      this.addOrUpdateAddonLineItem('shadeplus', {
        description: lineDesc,
        quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
        amount: this.calculateAmount(1, price, this.vatRate, 0),
        id: this.getAddonItemId('shadeplus')
      });
    };

    // Resolve price: find the row matching chosen description + width tier from cached data
    if (this.selectedWidthCm) {
      const widthRow = this.shadePlusAllRows.find(
        r => r.description === chosen.description && r.widthCm === this.selectedWidthCm
      );
      addItem(widthRow?.price ?? chosen.price);
    } else {
      addItem(chosen.price);
    }
  }

  onShadeplusOptionChange() {
    // User picked from dropdown — sync description then refresh line item
    const chosen = this.shadePlusOptions.find(o => o.shadePlusId === this.selectedShadePlusId);
    if (chosen) this.selectedShadePlusDescription = chosen.description;
    if (this.includeShadeplus) this.onShadeplusChange();
  }

  /**
   * Called when the user edits the ShadePlus description directly in the grid.
   * Updates only the description on the existing line item — price is unchanged.
   */
  onGridShadeplusDescriptionEdit(event: Event, _item: QuoteItemDisplay) {
    const newDesc = (event.target as HTMLInputElement).value;
    this.selectedShadePlusDescription = newDesc || 'ShadePlus';
    const items = this.quoteItemsSubject$.value;
    const idx = items.findIndex(i => i.id === this.getAddonItemId('shadeplus'));
    if (idx !== -1) {
      items[idx] = { ...items[idx], description: this.selectedShadePlusDescription };
      this.quoteItemsSubject$.next([...items]);
    }
  }

  /**
   * Called when the user edits the ShadePlus description text field directly.
   * Updates only the description on the existing line item — price is unchanged.
   */
  onShadeplusDescriptionEdit() {
    const items = this.quoteItemsSubject$.value;
    const idx = items.findIndex(i => i.id === this.getAddonItemId('shadeplus'));
    if (idx !== -1) {
      items[idx] = { ...items[idx], description: this.selectedShadePlusDescription || 'ShadePlus' };
      this.quoteItemsSubject$.next([...items]);
    }
  }

  onValanceStyleChange() {
    if (!this.includeValanceStyle) { this.removeAddonLineItem('valance'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getValanceStylePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        this.addOrUpdateAddonLineItem('valance', {
          description: 'Valance Style',
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          amount: this.calculateAmount(1, price, this.vatRate, 0),
          id: this.getAddonItemId('valance')
        });
      });
  }

  onWallSealingChange() {
    if (!this.includeWallSealing) { this.removeAddonLineItem('wallsealing'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getWallSealingProfilePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        this.addOrUpdateAddonLineItem('wallsealing', {
          description: 'Wall Sealing Profile',
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          amount: this.calculateAmount(1, price, this.vatRate, 0),
          id: this.getAddonItemId('wallsealing')
        });
      });
  }

  onMotorChange() {
    if (!this.selectedMotor) { this.removeAddonLineItem('motor'); return; }
    const motor = this.motorsSubject$.value.find(m => m.motorId.toString() === this.selectedMotor);
    if (motor) this.addOrUpdateAddonLineItem('motor', { description: motor.description, quantity: 1, unitPrice: motor.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, motor.price, this.vatRate, 0), id: this.getAddonItemId('motor') });
  }

  onHeaterChange() {
    if (!this.selectedHeater) { this.removeAddonLineItem('heater'); return; }
    const heater = this.heatersSubject$.value.find(h => h.heaterId.toString() === this.selectedHeater);
    if (heater) this.addOrUpdateAddonLineItem('heater', { description: heater.description, quantity: 1, unitPrice: heater.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, heater.price, this.vatRate, 0), id: this.getAddonItemId('heater') });
  }

  onLightingCassetteChange() {
    if (!this.selectedLightingCassette) { this.removeAddonLineItem('lighting'); return; }
    const cassette = this.lightingCassettesSubject$.value.find(c => c.lightingId.toString() === this.selectedLightingCassette);
    if (cassette) this.addOrUpdateAddonLineItem('lighting', { description: cassette.description, quantity: 1, unitPrice: cassette.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, cassette.price, this.vatRate, 0), id: this.getAddonItemId('lighting') });
  }

  onControlChange() {
    if (!this.selectedControl) { this.removeAddonLineItem('control'); return; }
    const control = this.controlsSubject$.value.find(c => c.controlId.toString() === this.selectedControl);
    if (control) this.addOrUpdateAddonLineItem('control', { description: control.description, quantity: 1, unitPrice: control.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, control.price, this.vatRate, 0), id: this.getAddonItemId('control') });
  }

  onElectricianChange() {
    if (!this.includeElectrician) { this.removeAddonLineItem('electrician'); return; }
    this.addOrUpdateAddonLineItem('electrician', { description: 'Electric connection by our Qualified Electrician', quantity: 1, unitPrice: this.electricianPrice, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, this.electricianPrice, this.vatRate, 0), id: this.getAddonItemId('electrician') });
  }

  onInstallationFeeChange() {
    // No separate installation line item — fee is folded into the first line item's
    // unit price, and the description suffix switches between Supply & Fit / Supply Only.
    this.removeAddonLineItem('installation'); // clean up any legacy item
    this.generateFirstLineItem();
  }

  /** Discount is optional — just triggers recalculation */
  onDiscountChange() {
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  // ── Quote item helpers ─────────────────────────────────────────────────────

  addQuoteItem() {
    const items = this.quoteItemsSubject$.value;
    items.push({ description: '', quantity: 1, unitPrice: 0, taxRate: this.vatRate, discountPercentage: 0, amount: 0 });
    this.quoteItemsSubject$.next([...items]);
  }

  removeQuoteItem(index: number) {
    const items = this.quoteItemsSubject$.value;
    items.splice(index, 1);
    this.quoteItemsSubject$.next([...items]);
  }

  onQuantityChange(item: QuoteItemDisplay) {
    item.amount = this.calculateAmount(item.quantity, item.unitPrice, item.taxRate || 0, item.discountPercentage || 0);
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  onItemChange(item: QuoteItemDisplay) {
    item.amount = this.calculateAmount(item.quantity, item.unitPrice, item.taxRate || 0, item.discountPercentage || 0);
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  calculateItemAmount(item: QuoteItemDisplay): number {
    return this.calculateAmount(item.quantity, item.unitPrice, item.taxRate || 0, item.discountPercentage || 0);
  }

  // ── Existing quotes grid ───────────────────────────────────────────────────

  loadExistingQuotes(workflowId: number) {
    this.isLoadingQuotes$.next(true);
    this.createQuoteService.getQuotesByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(quotes => {
          // Drafts have no draftQuoteId; finals point back to their source draft.
          // isFinal on a draft means it has been finalized — used by hasFinalQuote().
          this.draftQuotesSubject$.next(quotes.filter(q => !q.draftQuoteId));
          this.finalQuotesSubject$.next(quotes.filter(q =>  !!q.draftQuoteId));
        }),
        catchError(() => { this.notificationService.error('Failed to load quotes'); return of([]); }),
        finalize(() => this.isLoadingQuotes$.next(false))
      ).subscribe();
  }

  hasFinalQuote(draft: QuoteDto): boolean {
    // Backend marks the draft isFinal=true when a final quote is created from it.
    return !!draft.isFinal;
  }

  editQuote(quote: QuoteDto) {
    this.editingQuote = quote;
    this.populateFormFromQuote(quote);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingQuote = null;
    this.resetFormPartial();
  }

  deleteQuote(quote: QuoteDto) {
    this.createQuoteService.deleteQuote(quote.quoteId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(() => {
        this.draftQuotesSubject$.next(
          this.draftQuotesSubject$.value.filter(q => q.quoteId !== quote.quoteId)
        );
        if (this.editingQuote?.quoteId === quote.quoteId) {
          this.editingQuote = null;
          this.resetFormPartial();
        }
        this.notificationService.success(`Quote ${quote.quoteNumber} deleted.`);
        this.workflowStateService.notifyWorkflowChanged();
      });
  }

  private populateFormFromQuote(quote: QuoteDto) {
    const parseDate = (d: string | Date): string =>
      typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
    this.quoteDate    = parseDate(quote.quoteDate);
    this.followUpDate = parseDate(quote.followUpDate);
    this.discountType  = quote.discountType  || '';
    this.discountValue = quote.discountValue || 0;

    const displayItems: QuoteItemDisplay[] = (quote.quoteItems || []).map(qi => ({
      productItemId:      qi.productItemId,
      description:        qi.description,
      quantity:           qi.quantity,
      unitPrice:          qi.unitPrice,
      taxRate:            qi.taxRate,
      discountPercentage: qi.discountPercentage,
      amount:             this.calculateAmount(qi.quantity, qi.unitPrice, qi.taxRate, qi.discountPercentage)
    }));
    this.quoteItemsSubject$.next(displayItems);
    this.onDiscountChange();
  }

  // ── Grid calculation helpers ───────────────────────────────────────────────

  calcSubTotal(q: QuoteDto): number {
    return (q.quoteItems || []).reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  }

  calcQuoteDiscount(q: QuoteDto): number {
    if (!q.discountType || !q.discountValue || q.discountValue <= 0) return 0;
    const sub = this.calcSubTotal(q);
    return q.discountType === 'Percentage' ? sub * (q.discountValue / 100) : q.discountValue;
  }

  calcTax(q: QuoteDto): number {
    const items = q.quoteItems || [];
    const sub   = this.calcSubTotal(q);
    const itemDisc = items.reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    const itemTax  = items.reduce((s, i) => {
      const line = i.quantity * i.unitPrice;
      const disc = line * ((i.discountPercentage || 0) / 100);
      return s + ((line - disc) * ((i.taxRate || 0) / 100));
    }, 0);
    const qDisc = this.calcQuoteDiscount(q);
    if (qDisc > 0 && (sub - itemDisc) > 0) return itemTax * (1 - qDisc / (sub - itemDisc));
    return itemTax;
  }

  calcTotal(q: QuoteDto): number {
    const itemDisc = (q.quoteItems || []).reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    return this.calcSubTotal(q) - itemDisc - this.calcQuoteDiscount(q) + this.calcTax(q);
  }

  // ── Generate / Update quote ────────────────────────────────────────────────

  generateQuote() {
    const items = this.quoteItemsSubject$.value;
    if (!this.workflowId || !this.customerId || items.length === 0) {
      this.notificationService.error('Please fill in all required fields and ensure at least one quote item exists');
      return;
    }
    if (this.editingQuote) {
      this.updateDraftQuote(items);
    } else {
      this.createDraftQuote(items);
    }
  }

  private createDraftQuote(items: QuoteItemDisplay[]) {
    const createDto: CreateQuoteDto = {
      workflowId:    this.workflowId!,
      customerId:    this.customerId!,
      quoteDate:     this.quoteDate,
      followUpDate:  this.followUpDate,
      notes:         this.notes,
      terms:         this.terms,
      discountType:  this.discountType  || undefined,
      discountValue: this.discountValue || undefined,
      quoteItems: items.map(item => ({
        description:        item.description,
        quantity:           item.quantity,
        unitPrice:          item.unitPrice,
        taxRate:            item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0,
        productItemId:      item.productItemId
      }))
    };

    this.isLoading$.next(true);
    this.notificationService.error('');
    this.notificationService.success('');

    this.createQuoteService.createQuote(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (createdQuote) => {
          this.draftQuotesSubject$.next([...this.draftQuotesSubject$.value, createdQuote]);
          this.notificationService.success(`Draft Quote ${createdQuote.quoteNumber} created successfully!`);
          this.workflowStateService.notifyStepCompleted('create-quote');

          const pdfBase64 = await this.generatePdf(createdQuote);
          if (this.emailToCustomer) this.sendQuoteEmail(createdQuote, pdfBase64);

          setTimeout(() => this.resetFormPartial(), 2000);
        }),
        catchError(error => {
          this.notificationService.error(error.message || 'Error generating quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  private updateDraftQuote(items: QuoteItemDisplay[]) {
    const q = this.editingQuote!;
    const updateDto: UpdateQuoteDto = {
      quoteDate:     this.quoteDate,
      followUpDate:  this.followUpDate,
      notes:         this.notes,
      terms:         this.terms,
      discountType:  this.discountType  || undefined,
      discountValue: this.discountValue || undefined,
      quoteItems: items.map(item => ({
        description:        item.description,
        quantity:           item.quantity,
        unitPrice:          item.unitPrice,
        taxRate:            item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0,
        productItemId:      item.productItemId
      })) as UpdateQuoteItemDto[]
    };

    this.isLoading$.next(true);
    this.notificationService.error('');
    this.notificationService.success('');

    this.createQuoteService.updateQuote(q.quoteId, updateDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (updatedQuote) => {
          this.draftQuotesSubject$.next(
            this.draftQuotesSubject$.value.map(dq => dq.quoteId === updatedQuote.quoteId ? updatedQuote : dq)
          );
          this.editingQuote = null;
          this.notificationService.success(`Quote ${updatedQuote.quoteNumber} updated successfully!`);

          const pdfBase64 = await this.generatePdf(updatedQuote);
          if (this.emailToCustomer) this.sendQuoteEmail(updatedQuote, pdfBase64);

          setTimeout(() => this.resetFormPartial(), 2000);
        }),
        catchError(error => {
          this.notificationService.error(error.message || 'Error updating quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  /**
   * Send the generated quote as an email to the customer with the PDF attached.
   *
   * Uses POST /api/EmailTask/send-direct — no taskId required.
   * This always works regardless of whether an email task exists for this customer.
   *
   * @param quote      The just-created quote (for quoteNumber and totals).
   * @param pdfBase64  Base64-encoded PDF returned by generatePdf().
   *                   When null/empty the email is sent without an attachment.
   */
  private sendQuoteEmail(quote: QuoteDto, pdfBase64: string | null) {
    const toEmail = this.customerEmail;
    if (!toEmail) {
      this.notificationService.error('Cannot send email: no customer email address found.');
      return;
    }

    const body = this.buildQuoteEmailBody(quote);

    // Build attachment list — only include when we actually have PDF bytes
    const attachments: EmailAttachmentPayload[] = [];
    if (pdfBase64) {
      attachments.push({
        fileName:     `DraftQuote-${quote.quoteNumber}.pdf`,
        base64Content: pdfBase64,
        contentType:  'application/pdf'
      });
    }

    const payload: SendDirectEmailPayload = {
      toEmail,
      toName:   this.customerName,
      subject:  `Your Draft Quote DRAFT-${quote.quoteNumber} from Awnings Ireland`,
      body,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    this.isSendingEmail$.next(true);
    this.emailTaskService.sendDirectEmail(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isSendingEmail$.next(false))
      )
      .subscribe({
        next: () => this.notificationService.success(
          `Draft Quote DRAFT-${quote.quoteNumber} emailed to ${toEmail}` +
          (attachments.length > 0 ? ' with PDF attached' : '')
        ),
        error: () => this.notificationService.error('Quote saved but email could not be sent.')
      });
  }

  private buildQuoteEmailBody(quote: QuoteDto): string {
    const items = this.quoteItemsSubject$.value;
    const lines = items.map(i =>
      `  - ${i.description} (Qty: ${i.quantity}) — €${(i.quantity * i.unitPrice).toFixed(2)}`
    ).join('\n');

    return [
      `Dear ${this.customerName},`,
      '',
      `Please find below your draft quote reference DRAFT-${quote.quoteNumber}.`,
      '',
      'Items:',
      lines,
      '',
      `Sub-Total : €${quote.subTotal?.toFixed(2) ?? '0.00'}`,
      `VAT       : €${quote.taxAmount?.toFixed(2)  ?? '0.00'}`,
      `Total     : €${quote.totalAmount?.toFixed(2) ?? '0.00'}`,
      '',
      this.terms,
      '',
      'Kind regards,',
      'Awnings Ireland'
    ].join('\n');
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  /**
   * Generates the quote PDF.
   * - Triggers a browser download (existing behaviour).
   * - Returns the raw base64 string so sendQuoteEmail() can attach it.
   *   Returns null if the PDF service doesn't support blob generation.
   */
  private async generatePdf(quote: QuoteDto): Promise<string | null> {
  const items = this.quoteItemsSubject$.value;
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
  const itemLevelDiscount = items.reduce(
    (sum, i) => sum + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0
  );

  let quoteLevelDiscount = 0;
  if (this.discountType && this.discountValue > 0) {
    quoteLevelDiscount = this.discountType === 'Percentage'
      ? subtotal * (this.discountValue / 100)
      : this.discountValue;
  }

  const totalDiscount = itemLevelDiscount + quoteLevelDiscount;
  const totalTax = items.reduce((sum, i) => {
    const sub  = i.quantity * i.unitPrice;
    const disc = sub * ((i.discountPercentage || 0) / 100);
    return sum + ((sub - disc) * ((i.taxRate || 0) / 100));
  }, 0);

  const adjustedTax = quoteLevelDiscount > 0 && (subtotal - itemLevelDiscount) > 0
    ? totalTax * (1 - quoteLevelDiscount / (subtotal - itemLevelDiscount))
    : totalTax;

  const pdfData: QuotePdfData = {
    quoteNumber:        `DRAFT-${quote.quoteNumber}`,
    quoteDate:          typeof quote.quoteDate === 'string'
                          ? quote.quoteDate
                          : (quote.quoteDate as Date).toISOString(),
    expiryDate:         this.followUpDate,
    customerName:       this.customerName,
    customerAddress:    this.customerAddress    || '',
    customerCity:       this.customerCity       || '',
    customerPostalCode: this.customerPostalCode || '',
    reference:          this.selectedProductName || 'Awning Quote',
    items: items.map(i => ({
      description: i.description,
      quantity:    i.quantity,
      unitPrice:   i.unitPrice,
      tax:         i.taxRate || this.vatRate,
      amount:      i.amount
    })),
    subtotal:     subtotal,
    discount:     totalDiscount > 0 ? totalDiscount : undefined,
    totalTax:     adjustedTax,
    taxRate:      this.vatRate,
    total:        subtotal - totalDiscount + adjustedTax,
    terms:        this.terms
  };

  // FIXED: await the async service methods — without await the Promise
  // returned by generateQuotePdf() was ignored and doc.save() never fired.
  if (typeof this.pdfService.generateQuotePdfAsBase64 === 'function') {
    // Single call: builds PDF, triggers download, and returns base64
    return await this.pdfService.generateQuotePdfAsBase64(pdfData);
  }

  await this.pdfService.generateQuotePdf(pdfData);
  return null;
}

  // ── Form helpers ───────────────────────────────────────────────────────────

  resetFormPartial() {
    this.quoteDate   = new Date().toISOString().split('T')[0];
    this.followUpDate = this.getDefaultFollowUpDate();
    this.notes       = '';
    this.terms         = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
    this.installationFee = 0;
    this.selectedBrackets = [];
    this.selectedMotor = '';
    this.selectedHeater = '';
    this.selectedLightingCassette = '';
    this.selectedControl = '';
    this.includeElectrician = false;
    this.includeRalSurcharge = false;
    this.includeShadeplus = false;
    this.shadePlusAllRows = [];
    this.shadePlusOptions = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeValanceStyle = false;
    this.includeWallSealing = false;
    this.extrasDescription = '';
    this.extrasPrice = 0;
    this.enteredWidthCm = null;
    this.selectedWidthCm = null;
    this.selectedAwning = null;
    const first = this.quoteItemsSubject$.value.find(i => i.description.includes('wide x'));
    this.quoteItemsSubject$.next(first ? [first] : []);
    this.notificationService.success('');
  }

  close() {
    this.router.navigate(['/workflow'], {
      queryParams: { customerId: this.customerId, customerName: this.customerName }
    });
  }

  private getDefaultFollowUpDate(): string {
    const d = new Date(); d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  }

  private calculateAmount(qty: number, price: number, _taxRate: number, discPct: number): number {
    const sub  = qty * price;
    const disc = sub * (discPct / 100);
    return sub - disc;
  }

  private addOrUpdateAddonLineItem(type: string, lineItem: QuoteItemDisplay) {
    lineItem.productItemId = this.getAddonProductItemId(type);
    const items = this.quoteItemsSubject$.value;
    const idx   = items.findIndex(i => i.id === lineItem.id);
    if (idx !== -1) { items[idx] = lineItem; this.quoteItemsSubject$.next([...items]); }
    else            { const at = this.getAddonInsertIndex(type); items.splice(at, 0, lineItem); this.quoteItemsSubject$.next([...items]); }
  }

  private removeAddonLineItem(type: string) {
    const id    = this.getAddonItemId(type);
    const items = this.quoteItemsSubject$.value;
    const idx   = items.findIndex(i => i.id === id);
    if (idx !== -1) { items.splice(idx, 1); this.quoteItemsSubject$.next([...items]); }
  }

  private getAddonItemId(type: string): number {
    const ids: { [k: string]: number } = { bracket: 100001, arm: 100002, motor: 100003, heater: 100004, electrician: 100005, installation: 100006, ral: 100007, shadeplus: 100008, valance: 100009, wallsealing: 100010, lighting: 100011, control: 100012 };
    return ids[type] || 0;
  }

  /** Maps the addon slot name to the backend ProductItems.Id (ProductItemType enum). */
  private getAddonProductItemId(type: string): number | undefined {
    const map: { [k: string]: ProductItemType } = {
      bracket:     ProductItemType.Brackets,
      motor:       ProductItemType.Motors,
      valance:     ProductItemType.Valance,
      ral:         ProductItemType.NonStandardRals,
      shadeplus:   ProductItemType.ShadePlus,
      lighting:    ProductItemType.LightingCassettes,
      wallsealing: ProductItemType.WallSealingProfile,
      control:     ProductItemType.Controls,
      heater:      ProductItemType.Heaters,
    };
    return map[type];
  }

  private getAddonInsertIndex(type: string): number {
    const order = ['bracket', 'arm', 'motor', 'heater', 'electrician', 'installation', 'ral', 'shadeplus', 'valance', 'wallsealing', 'lighting', 'control'];
    const items = this.quoteItemsSubject$.value;
    let idx = 1;
    for (let i = 0; i < order.indexOf(type); i++) {
      if (items.some(item => item.id === this.getAddonItemId(order[i]))) idx++;
    }
    return idx;
  }
}