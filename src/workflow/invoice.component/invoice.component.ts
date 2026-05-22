import { Component, HostListener, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, takeUntil, tap, catchError, of, finalize } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { OptionLookupService, OptionLookupDto } from '../../service/option-lookup.service';

import { 
  InvoiceService,
  CreateInvoiceDto,
  InvoiceDto
} from '../../service/invoice.service';

import { 
  CreateQuoteService, 
  QuoteDto
} from '../../service/create-quote.service';

import {
  WorkflowService,
  WorkflowDto,
  MotorDto,
  HeaterDto,
  BracketDto,
  LightingCassetteDto,
  ControlDto,
  FrameColourOption
} from '../../service/workflow.service';

import { WorkflowStateService } from '../../service/workflow-state.service';
import { PdfGenerationService, InvoicePdfData } from '../../service/pdf-generation.service';

interface InvoiceItemDisplay {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  unit: string;
  totalPrice: number;
}

import { NotificationService } from '../../service/notification.service';
@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice.component.html',
  styleUrl: './invoice.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InvoiceComponent implements OnInit, OnDestroy {
  // Observables for data
  workflows$!: Observable<WorkflowDto[]>;
  quotes$!: Observable<QuoteDto[]>;
  brackets$!: Observable<BracketDto[]>;
  uniqueBrackets$!: Observable<BracketDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
  lightingCassettes$!: Observable<LightingCassetteDto[]>;
  controls$!: Observable<ControlDto[]>;
  availableWidths$!: Observable<number[]>;
  availableProjections$!: Observable<number[]>;
  invoiceItems$!: Observable<InvoiceItemDisplay[]>;
  
  // Computed observables for summary
  subtotal$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  isFormValid$!: Observable<boolean>;
  
  // State management with BehaviorSubjects
  isLoading$ = new BehaviorSubject<boolean>(false);
  
  
  
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);
  private quotesSubject$ = new BehaviorSubject<QuoteDto[]>([]);
  private bracketsSubject$ = new BehaviorSubject<BracketDto[]>([]);
  private motorsSubject$ = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$ = new BehaviorSubject<HeaterDto[]>([]);
  private lightingCassettesSubject$ = new BehaviorSubject<LightingCassetteDto[]>([]);
  private controlsSubject$          = new BehaviorSubject<ControlDto[]>([]);
  private widthsSubject$ = new BehaviorSubject<number[]>([]);
  private projectionsSubject$ = new BehaviorSubject<number[]>([]);
  private invoiceItemsSubject$ = new BehaviorSubject<InvoiceItemDisplay[]>([]);
  
  // Customer and workflow info
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName: string = '';
  customerAddress: string = '';
  customerCity: string = '';
  customerPostalCode: string = '';
  customerEmail: string = '';
  customerPhone: string = '';
  
  // Selection bindings for template
  selectedWorkflowId: number | null = null;
  selectedQuoteId: number | null = null;
  selectedQuote: QuoteDto | null = null;
  selectedModelId: number | null = null;
  /** The raw value the user typed in the width text box (cm). Used for display in line item. */
  enteredWidthCm: number | null = null;
  /** The resolved standard-width ceiling used for pricing lookups. */
  selectedWidthCm: number | null = null;
  selectedAwning: number | null = null;
  selectedProductName: string = '';
  
  // Invoice data
  invoiceDate: string = new Date().toISOString().split('T')[0];
  dueDate: string = this.getDefaultDueDate();
  invoiceStatus: string = 'Draft';
  notes: string = '';
  terms: string = 'Payment due within 30 days.\nLate payments subject to interest charges.';
  
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
    if (this.selectedBrackets.length === 1) return this.stripSurchargePrefix(this.selectedBrackets[0]);
    return `${this.selectedBrackets.length} brackets selected`;
  }

  stripSurchargePrefix(name: string): string {
    return name.replace(/^surcharge for\s*/i, '');
  }

  // Addon selections
  selectedBrackets: string[] = [];
  extrasDescription: string = '';
  extrasPrice: number = 0;
  fabricCode: string = '';
  windSensorOptions: OptionLookupDto[] = [];
  selectedWindSensor: string = '';
  selectedMotor: string = '';
  selectedHeater: string = '';
  selectedLightingCassette: string = '';
  selectedControl: string = '';
  includeElectrician: boolean = false;
  electricianPrice: number = 280.00;
  installationFee: number = 0;
  vatRate: number = 13.5;
  emailToCustomer: boolean = false;

  // RAL — dropdown: '' | 'standard' | 'nonstandard'
  selectedRalType: '' | 'standard' | 'nonstandard' = '';
  ralCustomCode    = '';
  frameColourOptions: FrameColourOption[] = [];
  selectedFrameColourId: number | null    = null;
  frameColourDropdownOpen                 = false;

  // Corrosion Protection
  includeCorrosionProtection = false;
  corrosionProtectionPrice   = 0;

  // Over 50 km
  over50Km = false;

  // Shadeplus — loaded once per product; options cover all widths
  includeShadeplus: boolean = false;
  shadePlusOptions: { shadePlusId: number; description: string; price: number }[] = [];
  shadePlusHasMultiple  = false;
  selectedShadePlusId: number | null = null;
  selectedShadePlusDescription = '';

  // Valance Style — price fetched from API based on productId + ceiling width
  includeValanceStyle: boolean = false;
  selectedValanceType = '';

  // Wall Sealing Profile — price fetched from API based on productId + ceiling width
  includeWallSealing: boolean = false;

  // ── Addon availability flags (set after workflow/product selected) ──────────
  hasRalSurcharge  = false;
  hasFrameColour   = false;
  hasShadePlus     = false;
  hasValanceStyle  = false;
  hasWallSealing   = false;
  
  calculatedPrice: number = 0;
  
  private destroy$ = new Subject<void>();

  trackByWorkflowId  = (_i: number, w: WorkflowDto)        => w.workflowId;
  trackByQuoteId     = (_i: number, q: QuoteDto)            => q.quoteId;
  trackByMotorId     = (_i: number, m: MotorDto)            => m.motorId;
  trackByHeaterId    = (_i: number, h: HeaterDto)           => h.heaterId;
  trackByLightingId  = (_i: number, c: LightingCassetteDto) => c.lightingId;
  trackByControlId   = (_i: number, c: ControlDto)          => c.controlId;
  trackByBracketName = (_i: number, b: BracketDto)          => b.bracketName;
  trackByShadePlusId = (_i: number, o: any)                 => o.shadePlusId;
  trackByIndex       = (i: number)                          => i;

  constructor(
    private invoiceService: InvoiceService,
    private quoteService: CreateQuoteService,
    private workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService,
    private pdfService: PdfGenerationService,
    private optionLookupService: OptionLookupService,
    private route: ActivatedRoute,
    private router: Router,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown'))       this.bracketDropdownOpen     = false;
    if (!target.closest('.frame-colour-dropdown')) this.frameColourDropdownOpen = false;
  }

  ngOnInit() {
    this.initializeObservables();
    this.initializeComponent();
    this.optionLookupService.getByCategory('WindSensor')
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(opts => { this.windSensorOptions = opts; this.cdr.markForCheck(); });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeObservables() {
    // Setup observables from subjects
    this.workflows$ = this.workflowsSubject$.asObservable();
    this.quotes$ = this.quotesSubject$.asObservable();
    this.brackets$ = this.bracketsSubject$.asObservable();
    this.uniqueBrackets$ = this.brackets$.pipe(
      map(brackets => {
        const seen = new Set<string>();
        return brackets.filter(b => {
          if (seen.has(b.bracketName)) return false;
          seen.add(b.bracketName);
          return true;
        });
      })
    );
    this.motors$ = this.motorsSubject$.asObservable();
    this.heaters$ = this.heatersSubject$.asObservable();
    this.lightingCassettes$ = this.lightingCassettesSubject$.asObservable();
    this.controls$          = this.controlsSubject$.asObservable();
    this.availableWidths$ = this.widthsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.invoiceItems$ = this.invoiceItemsSubject$.asObservable();
    
    // Setup computed observables
    this.subtotal$ = this.invoiceItems$.pipe(
      map(items => items.reduce((sum, item) => 
        sum + (item.quantity * item.unitPrice), 0
      ))
    );
    
    this.totalTax$ = this.invoiceItems$.pipe(
      map(items => items.reduce((sum, item) => {
        const discountPercentage = item?.discountPercentage || 0;
        const taxRate = item?.taxRate || 0;
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemDiscount = itemSubtotal * (discountPercentage / 100);
        const taxableAmount = itemSubtotal - itemDiscount;
        return sum + (taxableAmount * (taxRate / 100));
      }, 0))
    );
    
    this.totalAmount$ = combineLatest([this.subtotal$, this.totalTax$]).pipe(
      map(([subtotal, tax]) => subtotal + tax)
    );
    
    this.isFormValid$ = this.invoiceItems$.pipe(
      map(items => {
        if (!this.workflowId || !this.customerId) return false;
        if (items.length === 0) return false;
        if (!this.invoiceDate || !this.dueDate) return false;
        return items.every(item => 
          item.description.trim() !== '' && 
          item.quantity > 0 && 
          item.unitPrice >= 0
        );
      })
    );
  }

  private initializeComponent() {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? +params['customerId'] : null;
        this.customerName = params['customerName'] || '';
        this.customerAddress = params['customerAddress'] || '';
        this.customerCity = params['customerCity'] || '';
        this.customerPostalCode = params['customerPostalCode'] || '';
        this.customerEmail = params['customerEmail'] || '';
        this.customerPhone = params['customerPhone'] || '';

        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        const paramQuoteId = params['quoteId'] ? +params['quoteId'] : null;
        let workflowId = 0;

        if (!this.customerId) {
          this.notificationService.error('No customer selected. Please select a customer first.');
          return;
        }

        if (this.customerId) {
          const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
          this.customerId = selectedWorkflow?.customerId || null;
          this.customerName = selectedWorkflow?.customerName || '';
          workflowId = selectedWorkflow?.id || 0;
        }

        this.loadWorkflowsForCustomer(workflowId, paramQuoteId);
        this.cdr.markForCheck();
      });
  }

  private loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null, preselectedQuoteId: number | null = null) {
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
            this.onWorkflowChange(preselectedQuoteId);
          } else if (workflows.length === 1) {
            this.selectedWorkflowId = workflows[0].workflowId;
            this.workflowId = workflows[0].workflowId;
            this.onWorkflowChange(preselectedQuoteId);
          }
        }),
        catchError(error => {
          console.error('Error loading workflows:', error);
          this.notificationService.error('Failed to load workflows');
          return of([]);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  onWorkflowChange(preselectedQuoteId: number | null = null) {
    if (!this.selectedWorkflowId) return;

    this.workflowId = this.selectedWorkflowId;
    


    
    const workflows = this.workflowsSubject$.value;
    const selectedWorkflow = workflows.find(w => w.workflowId === this.selectedWorkflowId);
    
    if (selectedWorkflow) {
      this.selectedModelId = selectedWorkflow.productId;
      this.selectedProductName = selectedWorkflow.productName;
      
      this.loadProductWidthsAndProjections();
      this.loadProductAddons();
    }
    
    this.quotesSubject$.next([]);
    this.selectedQuoteId = null;
    this.invoiceItemsSubject$.next([]);
    this.resetSelections();

    this.isLoading$.next(true);
    this.quoteService.getQuotesByWorkflowId(this.selectedWorkflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(quotes => {
          this.quotesSubject$.next(quotes);
          
          if (preselectedQuoteId && quotes.some(q => q.quoteId === preselectedQuoteId)) {
            this.selectedQuoteId = preselectedQuoteId;
            this.onQuoteChange();
          } else if (quotes.length === 1) {
            this.selectedQuoteId = quotes[0].quoteId;
            this.onQuoteChange();
          }
        }),
        catchError(error => {
          console.error('Error loading quotes:', error);
          this.notificationService.error('Failed to load quotes for this workflow');
          return of([]);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedModelId) return;

    this.workflowService.getStandardWidthsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        map(widths => widths.sort((a, b) => a - b)),
        tap(widths => this.widthsSubject$.next(widths)),
        catchError(error => {
          console.error('Error loading widths:', error);
          return of([]);
        })
      )
      .subscribe();

    this.workflowService.getProjectionWidthsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        map(projections => projections.sort((a, b) => a - b)),
        tap(projections => this.projectionsSubject$.next(projections)),
        catchError(error => {
          console.error('Error loading projections:', error);
          return of([]);
        })
      )
      .subscribe();
  }

  private loadProductAddons() {
    if (!this.selectedModelId) return;

    // Reset availability flags for the newly selected product
    this.hasRalSurcharge     = false;
    this.hasFrameColour      = false;
    this.frameColourOptions  = [];
    this.hasShadePlus        = false;
    this.hasValanceStyle     = false;
    this.hasWallSealing      = false;
    this.shadePlusOptions    = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeShadeplus = false;
    this.removeAddonLineItem('shadeplus');

    this.workflowService.hasNonStandardRALColours(this.selectedModelId).pipe(takeUntil(this.destroy$)).subscribe(v => { this.hasRalSurcharge = v; this.cdr.markForCheck(); });

    this.workflowService.hasFrameColour(this.selectedModelId).pipe(takeUntil(this.destroy$)).subscribe(v => {
      this.hasFrameColour = v;
      this.cdr.markForCheck();
      if (v) {
        this.workflowService.getFrameColourOptions(this.selectedModelId!)
          .pipe(takeUntil(this.destroy$), catchError(() => of([])))
          .subscribe(opts => { this.frameColourOptions = opts; this.cdr.markForCheck(); });
      }
    });

    // Load all ShadePlus options for this product (all widths) in one call
    this.workflowService.getShadePlusOptions(this.selectedModelId, 0)
      .pipe(takeUntil(this.destroy$), catchError(() => of({ hasMultiple: false, options: [] })))
      .subscribe(result => {
        const opts = result.options ?? [];
        this.hasShadePlus         = opts.length > 0;
        this.shadePlusHasMultiple = result.hasMultiple;
        this.shadePlusOptions     = opts.map((o: any) => ({
          shadePlusId: o.shadePlusId,
          description: o.description ?? '',
          price: o.price
        }));
        if (this.shadePlusOptions.length > 0) {
          this.selectedShadePlusId          = this.shadePlusOptions[0].shadePlusId;
          this.selectedShadePlusDescription = this.shadePlusOptions[0].description;
        }
        this.cdr.markForCheck();
      });

    this.workflowService.hasValanceStyles(this.selectedModelId).pipe(takeUntil(this.destroy$)).subscribe(v => { this.hasValanceStyle = v; this.cdr.markForCheck(); });
    this.workflowService.hasWallSealingProfiles(this.selectedModelId).pipe(takeUntil(this.destroy$)).subscribe(v => { this.hasWallSealing = v; this.cdr.markForCheck(); });

    // Brackets + motors both depend on armTypeId — load with default armTypeId 1 initially
    this.reloadArmTypeDependents();

    this.workflowService.getHeatersForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(heaters => this.heatersSubject$.next(heaters)),
        catchError(() => of([]))
      )
      .subscribe();

    this.workflowService.getLightingCassettesForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$), tap(v => this.lightingCassettesSubject$.next(v)), catchError(() => of([])))
      .subscribe();

    this.workflowService.getControlsForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$), tap(v => this.controlsSubject$.next(v)), catchError(() => of([])))
      .subscribe();
  }

  onQuoteChange() {
    if (!this.selectedQuoteId) return;

    this.isLoading$.next(true);
    this.quoteService.getQuoteById(this.selectedQuoteId)
      .pipe(
        takeUntil(this.destroy$),
        tap(quote => {
          this.selectedQuote = quote;
          this.loadInvoiceItemsFromQuote(quote);
          this.presetSelectionsFromQuote(quote);
        }),
        catchError(error => {
          console.error('Error loading quote details:', error);
          this.notificationService.error('Failed to load quote details');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  private loadInvoiceItemsFromQuote(quote: QuoteDto) {
    const items = quote.quoteItems.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discountPercentage: item.discountPercentage || 0,
      unit: 'pcs',
      totalPrice: this.calculateItemTotal(item.quantity, item.unitPrice, item.taxRate, item.discountPercentage || 0)
    }));
    
    this.invoiceItemsSubject$.next(items);
  }

  private presetSelectionsFromQuote(quote: QuoteDto) {
    if (quote.quoteItems && quote.quoteItems.length > 0) {
      const firstItem = quote.quoteItems[0];
      const description = firstItem.description;
      
      const widthMatch = description.match(/(\d+\.?\d*)m wide/);
      const projectionMatch = description.match(/x (\d+)m projection/);
      
      if (widthMatch) {
        const widthM = parseFloat(widthMatch[1]);
        this.enteredWidthCm = Math.round(widthM * 100);
        this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
      }
      
      if (projectionMatch) {
        const projectionM = parseFloat(projectionMatch[1]);
        this.selectedAwning = Math.round(projectionM * 100);
      }
      
      const brackets = this.bracketsSubject$.value;
      const motors = this.motorsSubject$.value;
      const heaters = this.heatersSubject$.value;
      
      quote.quoteItems.forEach((item, index) => {
        if (index === 0) return;
        
        const desc = item.description.toLowerCase();
        
        const bracket = brackets.find(b => desc.includes(b.bracketName.toLowerCase()));
        if (bracket) this.selectedBrackets = [bracket.bracketName];
        
        const motor = motors.find(m => desc.includes(m.description.toLowerCase()) || desc.includes('motor'));
        if (motor) this.selectedMotor = motor.motorId.toString();
        
        const heater = heaters.find(h => desc.includes(h.description.toLowerCase()) || desc.includes('heater'));
        if (heater) this.selectedHeater = heater.heaterId.toString();
        
        if (desc.includes('electric connection') || desc.includes('qualified electrician')) {
          this.includeElectrician = true;
          this.electricianPrice = item.unitPrice;
        }
        
        if (desc.includes('installation')) {
          this.installationFee = item.unitPrice;
        }
      });
    }
  }

  private resetSelections() {
    this.enteredWidthCm = null;
    this.selectedWidthCm = null;
    this.selectedAwning = null;
    this.selectedBrackets = [];
    this.extrasDescription = '';
    this.extrasPrice = 0;
    this.fabricCode = '';
    this.selectedWindSensor = '';
    this.selectedMotor = '';
    this.selectedHeater = '';
    this.selectedLightingCassette = '';
    this.selectedControl = '';
    this.includeElectrician         = false;
    this.selectedRalType            = '';
    this.ralCustomCode              = '';
    this.selectedFrameColourId      = null;
    this.includeCorrosionProtection = false;
    this.corrosionProtectionPrice   = 0;
    this.over50Km                   = false;
    this.includeShadeplus           = false;
    this.shadePlusOptions = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeValanceStyle = false;
    this.selectedValanceType = '';
    this.includeWallSealing = false;
    this.installationFee = 0;
  }

  onWidthInput() {
    this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
    if (this.selectedFrameColourId !== null) this.onFrameColourChange();
    if (this.includeShadeplus)    this.onShadeplusChange();
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
    const floor = [...sorted].reverse().find(w => w <= entered);
    if (floor != null) return floor;
    return sorted[0];
  }

  onAwningChange() {
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
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

  private checkAndGenerateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedWidthCm || !this.selectedAwning || !this.selectedModelId) {
      return;
    }
    const productId = this.selectedModelId;
    const widthcm   = this.selectedWidthCm;
    const projcm    = this.selectedAwning;

    this.workflowService.getProjectionPriceForProduct(productId, widthcm, projcm)
      .pipe(
        takeUntil(this.destroy$),
        tap(price => { this.calculatedPrice = price; this.generateFirstLineItem(); }),
        catchError(() => { this.notificationService.error('Failed to get price for selected dimensions'); return of(0); })
      )
      .subscribe();
  }

  private generateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedAwning || !this.selectedProductName) {
      return;
    }
    // Display uses actual entered value; pricing used the ceiling width via calculatedPrice
    const widthM = (this.enteredWidthCm / 100).toFixed(2).replace(/\.?0+$/, '') + 'm';
    const projectionM = (this.selectedAwning / 100).toFixed(0) + 'm';
    const description = `${this.selectedProductName} closed cassette awning ${widthM} wide x ${projectionM} projection`;
    const unitPrice = this.calculatedPrice;
    const totalPrice = this.calculateItemTotal(1, unitPrice, this.vatRate, 0);

    const firstLineItem: InvoiceItemDisplay = {
      description: description,
      quantity: 1,
      unitPrice: unitPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: totalPrice
    };

    const currentItems = this.invoiceItemsSubject$.value;
    
    if (currentItems.length > 0 && currentItems[0].description.includes('wide x')) {
      currentItems[0] = firstLineItem;
      this.invoiceItemsSubject$.next([...currentItems]);
    } else {
      this.invoiceItemsSubject$.next([firstLineItem, ...currentItems]);
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
        description: this.stripSurchargePrefix(b.bracketName), quantity: 1, unitPrice: b.price,
        taxRate: this.vatRate, discountPercentage: 0, unit: 'pcs',
        totalPrice: this.calculateItemTotal(1, b.price, this.vatRate, 0),
        id: this.getAddonItemId('bracket')
      });
    } else {
      const combinedDesc = selected.map(b => this.stripSurchargePrefix(b.bracketName)).join(' + ');
      const combinedPrice = selected.reduce((sum, b) => sum + b.price, 0);
      this.addOrUpdateAddonLineItem('bracket', {
        description: combinedDesc, quantity: 1, unitPrice: combinedPrice,
        taxRate: this.vatRate, discountPercentage: 0, unit: 'pcs',
        totalPrice: this.calculateItemTotal(1, combinedPrice, this.vatRate, 0),
        id: this.getAddonItemId('bracket')
      });
    }
  }

  get filteredFrameColourOptions(): FrameColourOption[] {
    if (!this.selectedRalType) return [];
    return this.frameColourOptions.filter(o =>
      this.selectedRalType === 'nonstandard' ? o.isNonStandardRAL : !o.isNonStandardRAL
    );
  }

  onRalTypeChange() {
    this.selectedFrameColourId   = null;
    this.frameColourDropdownOpen = false;
    this.ralCustomCode           = '';
    this.removeAddonLineItem('ral');
    this.removeAddonLineItem('framecolour');
  }

  onRalCustomCodeChange() {
    if (this.selectedFrameColourId !== null) this.onFrameColourChange();
  }

  toggleFrameColourDropdown() { this.frameColourDropdownOpen = !this.frameColourDropdownOpen; }

  selectFrameColour(opt: FrameColourOption) {
    this.selectedFrameColourId   = opt.frameColourOptionId;
    this.frameColourDropdownOpen = false;
    this.onFrameColourChange();
  }

  getFrameColourLabel(): string {
    if (!this.selectedFrameColourId) return 'Select colour';
    return this.frameColourOptions.find(o => o.frameColourOptionId === this.selectedFrameColourId)?.description ?? 'Select colour';
  }

  getFrameColourCss(description: string): string {
    const n = description.toLowerCase();
    if (n.includes('anthracite'))                             return '#383E42';
    if (n.includes('black'))                                  return '#1C1C1C';
    if (n.includes('dark grey') || n.includes('dark gray'))   return '#5A5A5A';
    if (n.includes('grey') || n.includes('gray'))             return '#9E9E9E';
    if (n.includes('silver'))                                 return '#C0C0C0';
    if (n.includes('white'))                                  return '#F2F2F2';
    if (n.includes('cream') || n.includes('ivory'))           return '#F5F0D0';
    if (n.includes('bronze'))                                 return '#8C6B3E';
    if (n.includes('green'))                                  return '#3A5F3A';
    if (n.includes('blue'))                                   return '#2B4F7A';
    return '#888888';
  }

  onFrameColourChange() {
    const opt = this.frameColourOptions.find(o => o.frameColourOptionId === this.selectedFrameColourId);
    if (!opt) { this.removeAddonLineItem('framecolour'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getFrameColourPrice(this.selectedModelId, opt.frameColourOptionId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        const desc = this.ralCustomCode
          ? `Frame Colour - ${opt.description} (${this.ralCustomCode})`
          : `Frame Colour - ${opt.description}`;
        const lineItem: InvoiceItemDisplay = {
          description: desc, quantity: 1, unitPrice: price,
          taxRate: this.vatRate, discountPercentage: 0,
          unit: 'pcs', totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
          id: this.getAddonItemId('framecolour')
        };
        this.addOrUpdateAddonLineItem('framecolour', lineItem);
      });
  }

  onCorrosionProtectionChange() {
    if (!this.includeCorrosionProtection || this.corrosionProtectionPrice <= 0) {
      this.removeAddonLineItem('corrosionprotection');
      return;
    }
    const price = this.corrosionProtectionPrice;
    const lineItem: InvoiceItemDisplay = {
      description: 'Corrosion Protection', quantity: 1, unitPrice: price,
      taxRate: this.vatRate, discountPercentage: 0,
      unit: 'pcs', totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
      id: this.getAddonItemId('corrosionprotection')
    };
    this.addOrUpdateAddonLineItem('corrosionprotection', lineItem);
  }

  onOver50KmChange() {
    if (!this.over50Km) { this.removeAddonLineItem('over50km'); return; }
    const price = 350;
    const lineItem: InvoiceItemDisplay = {
      description: 'Travel Surcharge - Over 50km', quantity: 1, unitPrice: price,
      taxRate: this.vatRate, discountPercentage: 0,
      unit: 'pcs', totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
      id: this.getAddonItemId('over50km')
    };
    this.addOrUpdateAddonLineItem('over50km', lineItem);
  }

  onShadeplusChange() {
    if (!this.includeShadeplus) { this.removeAddonLineItem('shadeplus'); return; }
    if (!this.selectedModelId)  return;
    if (this.shadePlusOptions.length === 0) return;

    const chosen = this.shadePlusOptions.find(
      o => o.shadePlusId === this.selectedShadePlusId
    ) ?? this.shadePlusOptions[0];

    if (!chosen) return;

    this.selectedShadePlusId          = chosen.shadePlusId;
    this.selectedShadePlusDescription = chosen.description;

    // Single option → always "ShadePlus"; multiple → use chosen description
    const lineDesc = this.shadePlusHasMultiple ? this.stripSurchargePrefix(chosen.description) : 'Shadeplus';

    const addItem = (price: number) => {
      const lineItem: InvoiceItemDisplay = {
        description: lineDesc,
        quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
        unit: 'pcs', totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
        id: this.getAddonItemId('shadeplus')
      };
      this.addOrUpdateAddonLineItem('shadeplus', lineItem);
    };

    if (this.selectedWidthCm) {
      this.workflowService.getShadePlusOptions(this.selectedModelId, this.selectedWidthCm)
        .pipe(takeUntil(this.destroy$), catchError(() => of({ hasMultiple: false, options: [] })))
        .subscribe(result => {
          const widthOpt = (result.options ?? []).find(
            (o: any) => (o.description ?? '') === chosen.description
          );
          addItem(widthOpt?.price ?? chosen.price);
        });
    } else {
      addItem(chosen.price);
    }
  }

  onShadeplusOptionChange() {
    const chosen = this.shadePlusOptions.find(o => o.shadePlusId === this.selectedShadePlusId);
    if (chosen) this.selectedShadePlusDescription = chosen.description;
    if (this.includeShadeplus) this.onShadeplusChange();
  }

  getShadeplusPrice(): number { return 0; }

  onValanceStyleChange() {
    if (!this.includeValanceStyle) { this.removeAddonLineItem('valance'); this.selectedValanceType = ''; return; }
    if (!this.selectedValanceType || !this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getValanceStylePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        const lineItem: InvoiceItemDisplay = {
          description: 'Valance Style ' + this.selectedValanceType,
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          unit: 'pcs', totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
          id: this.getAddonItemId('valance')
        };
        this.addOrUpdateAddonLineItem('valance', lineItem);
      });
  }

  onValanceTypeChange() {
    if (this.includeValanceStyle && this.selectedValanceType) this.onValanceStyleChange();
  }

  onWallSealingChange() {
    if (!this.includeWallSealing) { this.removeAddonLineItem('wallsealing'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getWallSealingProfilePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        const lineItem: InvoiceItemDisplay = {
          description: 'Wall Sealing Profile',
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          unit: 'pcs', totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
          id: this.getAddonItemId('wallsealing')
        };
        this.addOrUpdateAddonLineItem('wallsealing', lineItem);
      });
  }

  onExtrasChange() {
    if (!this.extrasDescription || this.extrasPrice <= 0) {
      this.removeAddonLineItem('arm');
      return;
    }

    const totalPrice = this.calculateItemTotal(1, this.extrasPrice, this.vatRate, 0);

    const lineItem: InvoiceItemDisplay = {
      description: this.extrasDescription,
      quantity: 1,
      unitPrice: this.extrasPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: totalPrice,
      id: this.getAddonItemId('arm')
    };

    this.addOrUpdateAddonLineItem('arm', lineItem);
  }

  onFabricCodeChange() {
    if (!this.fabricCode.trim()) {
      this.removeAddonLineItem('fabriccode');
      return;
    }
    const lineItem: InvoiceItemDisplay = {
      description: `Fabric Code: ${this.fabricCode.trim()}`,
      quantity: 1,
      unitPrice: 0,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: 0,
      id: this.getAddonItemId('fabriccode')
    };
    this.addOrUpdateAddonLineItem('fabriccode', lineItem);
  }

  onMotorChange() {
    if (!this.selectedMotor) {
      this.removeAddonLineItem('motor');
      return;
    }

    const motors = this.motorsSubject$.value;
    const motor = motors.find(m => m.motorId.toString() === this.selectedMotor);
    if (motor) {
      const totalPrice = this.calculateItemTotal(1, motor.price, this.vatRate, 0);
      
      const lineItem: InvoiceItemDisplay = {
        description: motor.description,
        quantity: 1,
        unitPrice: motor.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        unit: 'pcs',
        totalPrice: totalPrice,
        id: this.getAddonItemId('motor')
      };

      this.addOrUpdateAddonLineItem('motor', lineItem);
    }
  }

  onHeaterChange() {
    if (!this.selectedHeater) {
      this.removeAddonLineItem('heater');
      return;
    }

    const heaters = this.heatersSubject$.value;
    const heater = heaters.find(h => h.heaterId.toString() === this.selectedHeater);
    if (heater) {
      const totalPrice = this.calculateItemTotal(1, heater.price, this.vatRate, 0);
      
      const lineItem: InvoiceItemDisplay = {
        description: heater.description,
        quantity: 1,
        unitPrice: heater.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        unit: 'pcs',
        totalPrice: totalPrice,
        id: this.getAddonItemId('heater')
      };

      this.addOrUpdateAddonLineItem('heater', lineItem);
    }
  }

  onControlChange() {
    if (!this.selectedControl) { this.removeAddonLineItem('control'); return; }
    const control = this.controlsSubject$.value.find(c => c.controlId.toString() === this.selectedControl);
    if (control) {
      const lineItem: InvoiceItemDisplay = {
        description: control.description,
        quantity: 1, unitPrice: control.price, taxRate: this.vatRate, discountPercentage: 0,
        unit: 'pcs', totalPrice: this.calculateItemTotal(1, control.price, this.vatRate, 0),
        id: this.getAddonItemId('control')
      };
      this.addOrUpdateAddonLineItem('control', lineItem);
    }
  }

  onLightingCassetteChange() {
    if (!this.selectedLightingCassette) { this.removeAddonLineItem('lighting'); return; }
    const cassette = this.lightingCassettesSubject$.value.find(c => c.lightingId.toString() === this.selectedLightingCassette);
    if (cassette) {
      const lineItem: InvoiceItemDisplay = {
        description: this.stripSurchargePrefix(cassette.description),
        quantity: 1, unitPrice: cassette.price, taxRate: this.vatRate, discountPercentage: 0,
        unit: 'pcs', totalPrice: this.calculateItemTotal(1, cassette.price, this.vatRate, 0),
        id: this.getAddonItemId('lighting')
      };
      this.addOrUpdateAddonLineItem('lighting', lineItem);
    }
  }

  onElectricianChange() {
    if (!this.includeElectrician) {
      this.removeAddonLineItem('electrician');
      return;
    }

    const totalPrice = this.calculateItemTotal(1, this.electricianPrice, this.vatRate, 0);
    
    const lineItem: InvoiceItemDisplay = {
      description: 'Electric connection by our Qualified Electrician',
      quantity: 1,
      unitPrice: this.electricianPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'service',
      totalPrice: totalPrice,
      id: this.getAddonItemId('electrician')
    };

    this.addOrUpdateAddonLineItem('electrician', lineItem);
  }

  onInstallationFeeChange() {
    if (!this.installationFee || this.installationFee <= 0) {
      this.removeAddonLineItem('installation');
      return;
    }

    const totalPrice = this.calculateItemTotal(1, this.installationFee, this.vatRate, 0);
    
    const lineItem: InvoiceItemDisplay = {
      description: 'Installation Fee',
      quantity: 1,
      unitPrice: this.installationFee,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'service',
      totalPrice: totalPrice,
      id: this.getAddonItemId('installation')
    };

    this.addOrUpdateAddonLineItem('installation', lineItem);
  }

  private calculateItemTotal(quantity: number, unitPrice: number, taxRate: number, discountPercentage: number): number {
    const subtotal = quantity * unitPrice;
    const discount = subtotal * (discountPercentage / 100);
    const taxableAmount = subtotal - discount;
    return taxableAmount;
  }

  onWindSensorChange() {
    if (!this.selectedWindSensor || this.selectedWindSensor === 'No') {
      this.removeAddonLineItem('windsensor');
      return;
    }
    const option = this.windSensorOptions.find(o => o.value === this.selectedWindSensor);
    if (!option) return;
    const price = option.price ?? 0;
    const lineItem: InvoiceItemDisplay = {
      description: `Wind Sensor - ${option.label}`,
      quantity: 1,
      unitPrice: price,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: this.calculateItemTotal(1, price, this.vatRate, 0),
      id: this.getAddonItemId('windsensor')
    };
    this.addOrUpdateAddonLineItem('windsensor', lineItem);
  }

  private addOrUpdateAddonLineItem(type: string, lineItem: InvoiceItemDisplay) {
    const currentItems = this.invoiceItemsSubject$.value;
    const existingIndex = currentItems.findIndex(item => item.id === lineItem.id);
    
    if (existingIndex !== -1) {
      currentItems[existingIndex] = lineItem;
      this.invoiceItemsSubject$.next([...currentItems]);
    } else {
      const insertIndex = this.getAddonInsertIndex(type);
      currentItems.splice(insertIndex, 0, lineItem);
      this.invoiceItemsSubject$.next([...currentItems]);
    }
  }

  private removeAddonLineItem(type: string) {
    const itemId = this.getAddonItemId(type);
    const currentItems = this.invoiceItemsSubject$.value;
    const index = currentItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      currentItems.splice(index, 1);
      this.invoiceItemsSubject$.next([...currentItems]);
    }
  }

  private getAddonItemId(type: string): number {
    const typeIds: { [key: string]: number } = {
      'bracket': 100001, 'arm': 100002, 'motor': 100003, 'heater': 100004,
      'electrician': 100005, 'installation': 100006, 'ral': 100007,
      'shadeplus': 100008, 'valance': 100009, 'wallsealing': 100010,
      'lighting': 100011, 'control': 100012, 'framecolour': 100013, 'windsensor': 100014,
      'corrosionprotection': 100015, 'over50km': 100016, 'fabriccode': 100017
    };
    return typeIds[type] || 0;
  }

  private getAddonInsertIndex(type: string): number {
    const typeOrder = ['bracket', 'arm', 'motor', 'heater', 'electrician', 'installation', 'ral', 'shadeplus', 'valance', 'wallsealing', 'lighting', 'control', 'framecolour', 'windsensor', 'corrosionprotection', 'over50km'];
    const currentTypeIndex = typeOrder.indexOf(type);
    const currentItems = this.invoiceItemsSubject$.value;
    
    let insertIndex = 1;
    
    for (let i = 0; i < currentTypeIndex; i++) {
      const existingType = typeOrder[i];
      const exists = currentItems.some(item => item.id === this.getAddonItemId(existingType));
      if (exists) {
        insertIndex++;
      }
    }
    
    return insertIndex;
  }

  private getDefaultDueDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  }

  addInvoiceItem() {
    const currentItems = this.invoiceItemsSubject$.value;
    currentItems.push({
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: 0
    });
    this.invoiceItemsSubject$.next([...currentItems]);
  }

  removeInvoiceItem(index: number) {
    const currentItems = this.invoiceItemsSubject$.value;
    currentItems.splice(index, 1);
    this.invoiceItemsSubject$.next([...currentItems]);
  }

  onQuantityChange(item: InvoiceItemDisplay) {
    const taxRate = item?.taxRate || 0;
    item.totalPrice = this.calculateItemTotal(item.quantity, item.unitPrice, taxRate, item.discountPercentage || 0);
    this.invoiceItemsSubject$.next([...this.invoiceItemsSubject$.value]);
  }

  onItemChange(item: InvoiceItemDisplay) {
    const taxRate = item?.taxRate || 0;
    item.totalPrice = this.calculateItemTotal(item.quantity, item.unitPrice, taxRate, item.discountPercentage || 0);
    this.invoiceItemsSubject$.next([...this.invoiceItemsSubject$.value]);
  }

  generateInvoice() {
    const items = this.invoiceItemsSubject$.value;
    
    if (!this.workflowId || !this.customerId || items.length === 0 || !this.invoiceDate || !this.dueDate) {
      this.notificationService.error('Please fill in all required fields and ensure at least one invoice item exists');
      return;
    }

    const createDto: CreateInvoiceDto = {
      workflowId:       this.workflowId!,
      customerId:       this.customerId!,
      invoiceDate:      new Date(this.invoiceDate),
      dueDate:          new Date(this.dueDate),
      notes:            this.notes,
      terms:            this.terms,
      windSensorOption: this.selectedWindSensor || undefined,
      fabricCode:       this.fabricCode         || undefined,
      invoiceItems: items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0,
        unit: item.unit || 'pcs'
      }))
    };

    this.isLoading$.next(true);
    this.notificationService.error('');
    this.notificationService.success('');

    this.invoiceService.createInvoice(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(createdInvoice => {
          console.log('Invoice created successfully:', createdInvoice);
          this.notificationService.success(`Invoice ${createdInvoice.invoiceNumber} created successfully!`);
          this.workflowStateService.notifyStepCompleted('invoice');
          
          this.generatePdf(createdInvoice);
          
          if (this.emailToCustomer) {
            this.sendInvoiceEmail(createdInvoice.id);
          }
          
          setTimeout(() => {
            this.resetFormPartial();
          }, 2000);
        }),
        catchError(error => {
          console.error('Error creating invoice:', error);
          this.notificationService.error(error.message || 'Error generating invoice. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  private generatePdf(invoice: InvoiceDto) {
    const items = this.invoiceItemsSubject$.value;
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalTax = items.reduce((sum, item) => {
      const discountPercentage = item?.discountPercentage || 0;
      const taxRate = item?.taxRate || 0;
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscount = itemSubtotal * (discountPercentage / 100);
      const taxableAmount = itemSubtotal - itemDiscount;
      return sum + (taxableAmount * (taxRate / 100));
    }, 0);

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: (invoice.invoiceDate instanceof Date) ? 
                   invoice.invoiceDate.toLocaleDateString('en-GB') : 
                   new Date(invoice.invoiceDate).toLocaleDateString('en-GB'),
      dueDate: (invoice.dueDate instanceof Date) ? 
               invoice.dueDate.toLocaleDateString('en-GB') : 
               new Date(invoice.dueDate).toLocaleDateString('en-GB'),
      customerName: this.customerName,
      customerAddress: this.customerAddress || invoice.customerAddress || '12 OSWALD ROAD',
      customerCity: this.customerCity || 'DUBLIN 4',
      customerPostalCode: this.customerPostalCode || 'D04 X470',
      items: items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tax: item.taxRate || this.vatRate,
        amount: item.totalPrice
      })),
      subtotal: subtotal,
      totalTax: totalTax,
      taxRate: this.vatRate,
      total: subtotal + totalTax,
      terms: this.terms,
      notes: this.notes,
      status: invoice.status,
      amountPaid: invoice.amountPaid || 0,
      amountDue: invoice.amountDue || (subtotal + totalTax)
    };

    this.pdfService.generateInvoicePdf(pdfData);
  }

  private sendInvoiceEmail(invoiceId: number) {
    this.invoiceService.sendInvoiceEmail(invoiceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('Invoice email sent successfully');
        },
        error: (error) => {
          console.error('Error sending invoice email:', error);
        }
      });
  }

  resetFormPartial() {
    this.invoiceDate = new Date().toISOString().split('T')[0];
    this.dueDate = this.getDefaultDueDate();
    this.notes = '';
    this.terms = 'Payment due within 30 days.\nLate payments subject to interest charges.';
    this.invoiceStatus = 'Draft';
    this.emailToCustomer = false;
    
    if (this.selectedQuote) {
      this.loadInvoiceItemsFromQuote(this.selectedQuote);
      this.presetSelectionsFromQuote(this.selectedQuote);
    } else {
      this.invoiceItemsSubject$.next([]);
      this.resetSelections();
    }
    
    this.notificationService.success('');
  }

  close() {
    this.router.navigate(['/workflow'], {
      queryParams: { 
        customerId: this.customerId, 
        customerName: this.customerName 
      }
    });
  }
}