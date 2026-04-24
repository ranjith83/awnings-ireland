import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BehaviorSubject, Observable, Subject, combineLatest,
  takeUntil, tap, catchError, of, finalize, filter
} from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';

import {
  CreateQuoteService,
  CreateQuoteDto,
  CreateFinalQuoteDto,
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

@Component({
  selector: 'app-final-quote',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './final-quote.component.html',
  styleUrls: [
    '../create-quote.component/create-quote.component.css',
    './final-quote.component.css'
  ]
})
export class FinalQuoteComponent implements OnInit, OnDestroy {

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
  draftQuotes$!: Observable<QuoteDto[]>;
  finalQuotes$!: Observable<QuoteDto[]>;
  subtotal$!: Observable<number>;
  quoteDiscount$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  isFormValid$!: Observable<boolean>;

  // ── State subjects ─────────────────────────────────────────────────────────
  isLoading$         = new BehaviorSubject<boolean>(false);
  isLoadingQuotes$   = new BehaviorSubject<boolean>(false);
  isSendingEmail$    = new BehaviorSubject<boolean>(false);
  errorMessage$      = new BehaviorSubject<string>('');
  successMessage$    = new BehaviorSubject<string>('');

  private workflowsSubject$         = new BehaviorSubject<WorkflowDto[]>([]);
  private suppliersSubject$         = new BehaviorSubject<SupplierDto[]>([]);
  private bracketsSubject$          = new BehaviorSubject<BracketDto[]>([]);
  private motorsSubject$            = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$           = new BehaviorSubject<HeaterDto[]>([]);
  private lightingCassettesSubject$ = new BehaviorSubject<LightingCassetteDto[]>([]);
  private controlsSubject$          = new BehaviorSubject<ControlDto[]>([]);
  private widthsSubject$            = new BehaviorSubject<number[]>([]);
  private projectionsSubject$       = new BehaviorSubject<number[]>([]);
  private quoteItemsSubject$        = new BehaviorSubject<QuoteItemDisplay[]>([]);
  private draftQuotesSubject$       = new BehaviorSubject<QuoteDto[]>([]);
  private finalQuotesSubject$       = new BehaviorSubject<QuoteDto[]>([]);

  // ── Quote selection / edit state ───────────────────────────────────────────
  selectedDraftQuote: QuoteDto | null = null;
  editingFinalQuote: QuoteDto | null  = null;

  get linkedFinalQuotes(): QuoteDto[] {
    if (!this.selectedDraftQuote) return [];
    return this.finalQuotesSubject$.value.filter(
      fq => fq.draftQuoteId === this.selectedDraftQuote!.quoteId
    );
  }

  /** Show the form when: draft selected with no final quote yet, OR actively editing a final quote. */
  get showForm(): boolean {
    return (this.selectedDraftQuote !== null && this.linkedFinalQuotes.length === 0)
      || this.editingFinalQuote !== null;
  }

  // ── Customer / workflow context ────────────────────────────────────────────
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName       = '';
  customerEmail      = '';
  customerAddress    = '';
  customerCity       = '';
  customerPostalCode = '';

  // ── Selection bindings ─────────────────────────────────────────────────────
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null    = null;
  enteredWidthCm: number | null     = null;
  selectedWidthCm: number | null    = null;
  selectedAwning: number | null     = null;
  selectedProductName               = '';

  // ── Quote metadata ─────────────────────────────────────────────────────────
  quoteDate    = new Date().toISOString().split('T')[0];
  followUpDate = this.getDefaultFollowUpDate();
  notes        = '';
  terms        = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';

  // ── Discount ───────────────────────────────────────────────────────────────
  discountType  = '';
  discountValue = 0;

  // ── Brackets dropdown ──────────────────────────────────────────────────────
  bracketDropdownOpen = false;

  toggleBracketDropdown() { this.bracketDropdownOpen = !this.bracketDropdownOpen; }
  closeBracketDropdown()  { this.bracketDropdownOpen = false; }

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
  installationFee            = 0;
  vatRate                    = 13.5;
  selectedBrackets           : string[] = [];
  selectedMotor              = '';
  selectedHeater             = '';
  selectedLightingCassette   = '';
  selectedControl            = '';
  includeElectrician         = false;
  electricianPrice           = 280.00;

  includeRalSurcharge  = false;
  includeShadeplus     = false;
  shadePlusAllRows: { shadePlusId: number; description: string; widthCm: number; price: number }[] = [];
  shadePlusOptions: { shadePlusId: number; description: string; price: number }[] = [];
  shadePlusHasMultiple       = false;
  selectedShadePlusId: number | null = null;
  selectedShadePlusDescription      = '';

  includeValanceStyle  = false;
  includeWallSealing   = false;

  hasRalSurcharge  = false;
  hasShadePlus     = false;
  hasValanceStyle  = false;
  hasWallSealing   = false;

  extrasDescription = '';
  extrasPrice       = 0;

  emailToCustomer = false;
  calculatedPrice = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private createQuoteService: CreateQuoteService,
    private workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService,
    private pdfService: PdfGenerationService,
    private emailTaskService: EmailTaskService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

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
    this.workflows$         = this.workflowsSubject$.asObservable();
    this.suppliers$         = this.suppliersSubject$.asObservable();
    this.brackets$          = this.bracketsSubject$.asObservable();
    this.uniqueBrackets$    = this.brackets$.pipe(
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
    this.finalQuotes$         = this.finalQuotesSubject$.asObservable();

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
        this.customerId         = params['customerId']         ? +params['customerId']         : null;
        this.customerName       = params['customerName']       || '';
        this.customerEmail      = params['customerEmail']      || '';
        this.customerAddress    = params['customerAddress']    || '';
        this.customerCity       = params['customerCity']       || '';
        this.customerPostalCode = params['customerPostalCode'] || '';

        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        let workflowId = 0;

        if (!this.customerId) {
          this.errorMessage$.next('No customer selected. Please select a customer first.');
          return;
        }

        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        this.customerId   = selectedWorkflow?.customerId   || this.customerId;
        this.customerName = selectedWorkflow?.customerName || this.customerName;
        workflowId        = selectedWorkflow?.id           || paramWorkflowId || 0;

        this.loadWorkflowsForCustomer(workflowId);
        this.loadSuppliers();

        if (this.customerId && !this.customerEmail) this.resolveCustomerEmail(this.customerId);
      });
  }

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
      .pipe(
        takeUntil(this.destroy$),
        tap(s => this.suppliersSubject$.next(s)),
        catchError(() => { this.errorMessage$.next('Failed to load suppliers'); return of([]); })
      ).subscribe();
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
            this.loadExistingQuotes(preselectedWorkflowId);
          } else if (workflows.length === 1) {
            this.selectedWorkflowId = workflows[0].workflowId;
            this.workflowId = workflows[0].workflowId;
            this.onWorkflowChange();
            this.loadExistingQuotes(workflows[0].workflowId);
          }
        }),
        catchError(() => { this.errorMessage$.next('Failed to load workflows'); return of([]); }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  loadExistingQuotes(workflowId: number) {
    this.isLoadingQuotes$.next(true);
    this.createQuoteService.getQuotesByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(quotes => {
          // Drafts have no draftQuoteId; finals point back to their source draft.
          this.draftQuotesSubject$.next(quotes.filter(q => !q.draftQuoteId));
          this.finalQuotesSubject$.next(quotes.filter(q =>  !!q.draftQuoteId));
        }),
        catchError(() => { this.errorMessage$.next('Failed to load existing quotes'); return of([]); }),
        finalize(() => this.isLoadingQuotes$.next(false))
      ).subscribe();
  }

  // ── Draft quote selection ──────────────────────────────────────────────────

  selectDraftQuote(quote: QuoteDto) {
    this.selectedDraftQuote = quote;
    this.editingFinalQuote  = null;

    // Use isFinal on the draft (set by backend when finalized) as the primary check.
    // Fall back to scanning finalQuotesSubject$ in case the in-memory draft
    // hasn't been refreshed yet (e.g. optimistic add after create).
    const hasLinked = !!quote.isFinal ||
      this.finalQuotesSubject$.value.some(fq => fq.draftQuoteId === quote.quoteId);

    if (!hasLinked) {
      this.populateFormFromQuote(quote);
    } else {
      this.quoteItemsSubject$.next([]);
      this.resetAddonCheckboxes();
    }
  }

  clearDraftSelection() {
    this.selectedDraftQuote = null;
    this.editingFinalQuote  = null;
    this.quoteItemsSubject$.next([]);
    this.discountType      = '';
    this.discountValue     = 0;
    this.enteredWidthCm    = null;
    this.selectedWidthCm   = null;
    this.selectedAwning    = null;
    this.extrasDescription = '';
    this.extrasPrice       = 0;
    this.installationFee   = 0;
    this.resetAddonCheckboxes();
  }

  // ── Final quote actions (edit / delete / regenerate) ──────────────────────

  editFinalQuote(fq: QuoteDto) {
    this.editingFinalQuote = fq;
    this.populateFormFromQuote(fq);
  }

  deleteFinalQuote(fq: QuoteDto) {
    this.createQuoteService.deleteQuote(fq.quoteId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(() => {
        const remaining = this.finalQuotesSubject$.value.filter(q => q.quoteId !== fq.quoteId);
        this.finalQuotesSubject$.next(remaining);

        if (this.editingFinalQuote?.quoteId === fq.quoteId) {
          this.editingFinalQuote = null;
          this.quoteItemsSubject$.next([]);
          this.resetAddonCheckboxes();
        }
        this.successMessage$.next(`Final Quote ${fq.quoteNumber} deleted.`);
        setTimeout(() => this.successMessage$.next(''), 3000);
      });
  }

  regenerateFinalQuote(fq: QuoteDto) {
    this.downloadQuotePdf(fq);
  }

  // ── Shared form population ─────────────────────────────────────────────────

  private populateFormFromQuote(quote: QuoteDto) {
    const parseDate = (d: string | Date): string =>
      typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
    this.quoteDate    = parseDate(quote.quoteDate);
    this.followUpDate = parseDate(quote.followUpDate);
    this.discountType  = quote.discountType  || '';
    this.discountValue = quote.discountValue || 0;

    // ── Parse width & projection from first line item description ──────────
    const firstItem = (quote.quoteItems || [])[0];
    if (firstItem) {
      const dimMatch = firstItem.description.match(/(\d+\.?\d*)m\s+wide\s+x\s+(\d+\.?\d*)m\s+projection/i);
      if (dimMatch) {
        this.enteredWidthCm  = Math.round(parseFloat(dimMatch[1]) * 100);
        this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
        this.selectedAwning  = Math.round(parseFloat(dimMatch[2]) * 100);
        if (this.selectedModelId) {
          this.reloadArmTypeDependents();
        }
      }
    }

    // ── Populate line items — carry productItemId from server ──────────────
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

    // ── Restore addon UI state using productItemId ─────────────────────────
    this.resetAddonCheckboxes();
    for (const qi of quote.quoteItems || []) {
      switch (qi.productItemId) {
        case ProductItemType.NonStandardRals:    this.includeRalSurcharge = true; break;
        case ProductItemType.ShadePlus:          this.includeShadeplus    = true; break;
        case ProductItemType.Valance:            this.includeValanceStyle = true; break;
        case ProductItemType.WallSealingProfile: this.includeWallSealing  = true; break;
      }
      if (!qi.productItemId && qi.description.toLowerCase().includes('electrician')) {
        this.includeElectrician = true;
      }
    }

    // ── Match brackets by productItemId ───────────────────────────────────
    const bracketItems = (quote.quoteItems || []).filter(qi => qi.productItemId === ProductItemType.Brackets);
    if (bracketItems.length) {
      this.uniqueBrackets$.pipe(
        filter(brackets => brackets.length > 0), take(1), takeUntil(this.destroy$)
      ).subscribe(brackets => {
        const matched = brackets
          .filter(b => bracketItems.some(qi => qi.description.toLowerCase().includes(b.bracketName.toLowerCase())))
          .map(b => b.bracketName);
        if (matched.length) this.selectedBrackets = matched;
      });
    }

    // ── Match motor ────────────────────────────────────────────────────────
    const motorItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.Motors);
    if (motorItem) {
      this.motors$.pipe(filter(m => m.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(motors => {
          const m = motors.find(m => m.description === motorItem.description);
          if (m) this.selectedMotor = m.motorId.toString();
        });
    }

    // ── Match heater ───────────────────────────────────────────────────────
    const heaterItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.Heaters);
    if (heaterItem) {
      this.heaters$.pipe(filter(h => h.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(heaters => {
          const h = heaters.find(h => h.description === heaterItem.description);
          if (h) this.selectedHeater = h.heaterId.toString();
        });
    }

    // ── Match lighting cassette ────────────────────────────────────────────
    const lightingItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.LightingCassettes);
    if (lightingItem) {
      this.lightingCassettes$.pipe(filter(l => l.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(cassettes => {
          const c = cassettes.find(c => c.description === lightingItem.description);
          if (c) this.selectedLightingCassette = c.lightingId.toString();
        });
    }

    // ── Match control ──────────────────────────────────────────────────────
    const controlItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.Controls);
    if (controlItem) {
      this.controls$.pipe(filter(c => c.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(controls => {
          const c = controls.find(c => c.description === controlItem.description);
          if (c) this.selectedControl = c.controlId.toString();
        });
    }

    // ── Restore extras (free-text line item — no productItemId, not electrician) ──
    const extrasItem = (quote.quoteItems || []).find((qi, idx) =>
      idx > 0 && !qi.productItemId && !qi.description.toLowerCase().includes('electrician')
    );
    if (extrasItem) {
      this.extrasDescription = extrasItem.description;
      this.extrasPrice       = extrasItem.unitPrice;
    }

    // ── Restore installation fee — fetch base price and subtract ───────────
    const mainItem = (quote.quoteItems || [])[0];
    if (
      mainItem &&
      mainItem.description.toLowerCase().includes('supply & fit') &&
      this.selectedModelId && this.selectedWidthCm && this.selectedAwning
    ) {
      this.workflowService
        .getProjectionPriceForProduct(this.selectedModelId, this.selectedWidthCm, this.selectedAwning)
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe(basePrice => {
          const fee = Math.round((mainItem.unitPrice - basePrice) * 100) / 100;
          this.installationFee = fee > 0 ? fee : 0;
        });
    } else {
      this.installationFee = 0;
    }

    this.onDiscountChange();
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

    this.workflowService.hasNonStandardRALColours(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.hasRalSurcharge = v);

    this.workflowService.getShadePlusOptions(id, 0)
      .pipe(takeUntil(this.destroy$), catchError(() => of({ hasMultiple: false, options: [] })))
      .subscribe(result => {
        const opts = result.options ?? [];
        this.hasShadePlus         = opts.length > 0;
        this.shadePlusHasMultiple = result.hasMultiple;
        this.shadePlusAllRows = opts.map(o => ({
          shadePlusId: o.shadePlusId,
          description: o.description ?? '',
          widthCm: (o as any).widthCm ?? 0,
          price: o.price
        }));
        const seen = new Set<string>();
        this.shadePlusOptions = opts
          .filter(o => { const key = o.description ?? ''; if (seen.has(key)) return false; seen.add(key); return true; })
          .map(o => ({ shadePlusId: o.shadePlusId, description: o.description ?? '', price: o.price }));
        if (this.shadePlusOptions.length > 0) {
          this.selectedShadePlusId = this.shadePlusOptions[0].shadePlusId;
          this.selectedShadePlusDescription = this.shadePlusOptions[0].description;
        }
      });

    this.workflowService.hasValanceStyles(id).pipe(takeUntil(this.destroy$)).subscribe(v => this.hasValanceStyle = v);
    this.workflowService.hasWallSealingProfiles(id).pipe(takeUntil(this.destroy$)).subscribe(v => this.hasWallSealing = v);
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
      this.workflowService.getArmTypeForProjection(productId, this.selectedWidthCm, this.selectedAwning)
        .pipe(
          takeUntil(this.destroy$),
          tap(armTypeId => {
            this.workflowService.getBracketsForProduct(productId, armTypeId)
              .pipe(takeUntil(this.destroy$), tap(brackets => { this.bracketsSubject$.next(brackets); this.onBracketChange(); }), catchError(() => of([]))).subscribe();
            this.workflowService.getMotorsForProduct(productId, armTypeId)
              .pipe(takeUntil(this.destroy$), tap(motors => {
                this.motorsSubject$.next(motors);
                if (this.selectedMotor && !motors.some(m => m.motorId.toString() === this.selectedMotor)) { this.selectedMotor = ''; this.onMotorChange(); }
              }), catchError(() => of([]))).subscribe();
          }),
          catchError(() => of(null))
        ).subscribe();
    } else {
      this.workflowService.getBracketsForProduct(productId, 1)
        .pipe(
          takeUntil(this.destroy$),
          tap(brackets => {
            this.bracketsSubject$.next(brackets);
            if (this.selectedBrackets.length === 0) {
              const def = brackets.find(b => b.bracketName.toLowerCase().includes('surcharge for face fixture') && !b.bracketName.toLowerCase().includes('spreader'));
              if (def) { this.selectedBrackets = [def.bracketName]; this.onBracketChange(); }
            } else { this.onBracketChange(); }
          }),
          catchError(() => of([]))
        ).subscribe();

      this.workflowService.getMotorsForProduct(productId, 1)
        .pipe(
          takeUntil(this.destroy$),
          tap(motors => {
            this.motorsSubject$.next(motors);
            if (!this.selectedMotor) {
              const def = motors.find(m => m.description.toLowerCase().includes('radio') && m.description.toLowerCase().includes('rts') && m.description.toLowerCase().includes('1 ch'));
              if (def) { this.selectedMotor = def.motorId.toString(); this.onMotorChange(); }
            }
          }),
          catchError(() => of([]))
        ).subscribe();
    }
  }

  // ── Dimension / addon handlers ─────────────────────────────────────────────

  onWidthInput() {
    this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
    if (this.includeRalSurcharge)  this.onRalSurchargeChange();
    if (this.includeShadeplus)     this.onShadeplusChange();
    if (this.includeValanceStyle)  this.onValanceStyleChange();
    if (this.includeWallSealing)   this.onWallSealingChange();
  }

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

  private checkAndGenerateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedWidthCm || !this.selectedAwning || !this.selectedModelId) return;
    const productId = this.selectedModelId;
    const widthcm   = this.selectedWidthCm;
    const projcm    = this.selectedAwning;

    this.workflowService.getProjectionPriceForProduct(productId, widthcm, projcm)
      .pipe(takeUntil(this.destroy$), tap(price => { this.calculatedPrice = price; this.generateFirstLineItem(); }), catchError(() => { this.errorMessage$.next('Failed to get price'); return of(0); }))
      .subscribe();
  }

  private generateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedAwning || !this.selectedProductName) return;
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
      this.addOrUpdateAddonLineItem('bracket', { description: b.bracketName, quantity: 1, unitPrice: b.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, b.price, this.vatRate, 0), id: this.getAddonItemId('bracket') });
    } else {
      const combinedDesc  = selected.map(b => b.bracketName).join(' + ');
      const combinedPrice = selected.reduce((sum, b) => sum + b.price, 0);
      this.addOrUpdateAddonLineItem('bracket', { description: combinedDesc, quantity: 1, unitPrice: combinedPrice, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, combinedPrice, this.vatRate, 0), id: this.getAddonItemId('bracket') });
    }
  }

  onExtrasChange() {
    if (!this.extrasDescription || this.extrasPrice <= 0) { this.removeAddonLineItem('arm'); return; }
    this.addOrUpdateAddonLineItem('arm', { description: this.extrasDescription, quantity: 1, unitPrice: this.extrasPrice, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, this.extrasPrice, this.vatRate, 0), id: this.getAddonItemId('arm') });
  }

  onRalSurchargeChange() {
    if (!this.includeRalSurcharge) { this.removeAddonLineItem('ral'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getNonStandardRALColourPrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => { this.addOrUpdateAddonLineItem('ral', { description: 'Surcharge for non-standard RAL colors', quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, price, this.vatRate, 0), id: this.getAddonItemId('ral') }); });
  }

  onShadeplusChange() {
    if (!this.includeShadeplus) { this.removeAddonLineItem('shadeplus'); return; }
    if (!this.selectedModelId || this.shadePlusOptions.length === 0) return;
    const chosen = this.shadePlusOptions.find(o => o.shadePlusId === this.selectedShadePlusId) ?? this.shadePlusOptions[0];
    if (!chosen) return;
    this.selectedShadePlusId = chosen.shadePlusId;
    this.selectedShadePlusDescription = chosen.description;
    const lineDesc = this.shadePlusHasMultiple ? chosen.description : 'ShadePlus';
    const addItem = (price: number) => {
      this.addOrUpdateAddonLineItem('shadeplus', { description: lineDesc, quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, price, this.vatRate, 0), id: this.getAddonItemId('shadeplus') });
    };
    if (this.selectedWidthCm) {
      const widthRow = this.shadePlusAllRows.find(r => r.description === chosen.description && r.widthCm === this.selectedWidthCm);
      addItem(widthRow?.price ?? chosen.price);
    } else { addItem(chosen.price); }
  }

  onShadeplusOptionChange() {
    const chosen = this.shadePlusOptions.find(o => o.shadePlusId === this.selectedShadePlusId);
    if (chosen) this.selectedShadePlusDescription = chosen.description;
    if (this.includeShadeplus) this.onShadeplusChange();
  }

  onGridShadeplusDescriptionEdit(event: Event, _item: QuoteItemDisplay) {
    const newDesc = (event.target as HTMLInputElement).value;
    this.selectedShadePlusDescription = newDesc || 'ShadePlus';
    const items = this.quoteItemsSubject$.value;
    const idx = items.findIndex(i => i.id === this.getAddonItemId('shadeplus'));
    if (idx !== -1) { items[idx] = { ...items[idx], description: this.selectedShadePlusDescription }; this.quoteItemsSubject$.next([...items]); }
  }

  onShadeplusDescriptionEdit() {
    const items = this.quoteItemsSubject$.value;
    const idx = items.findIndex(i => i.id === this.getAddonItemId('shadeplus'));
    if (idx !== -1) { items[idx] = { ...items[idx], description: this.selectedShadePlusDescription || 'ShadePlus' }; this.quoteItemsSubject$.next([...items]); }
  }

  onValanceStyleChange() {
    if (!this.includeValanceStyle) { this.removeAddonLineItem('valance'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getValanceStylePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => { this.addOrUpdateAddonLineItem('valance', { description: 'Valance Style', quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, price, this.vatRate, 0), id: this.getAddonItemId('valance') }); });
  }

  onWallSealingChange() {
    if (!this.includeWallSealing) { this.removeAddonLineItem('wallsealing'); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getWallSealingProfilePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => { this.addOrUpdateAddonLineItem('wallsealing', { description: 'Wall Sealing Profile', quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, price, this.vatRate, 0), id: this.getAddonItemId('wallsealing') }); });
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
    this.removeAddonLineItem('installation');
    this.generateFirstLineItem();
  }

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

  // ── Grid calculation helpers (compute from quoteItems, not stored values) ──

  calcSubTotal(q: QuoteDto): number {
    return (q.quoteItems || []).reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
  }

  calcQuoteDiscount(q: QuoteDto): number {
    if (!q.discountType || !q.discountValue || q.discountValue <= 0) return 0;
    const sub = this.calcSubTotal(q);
    if (q.discountType === 'Percentage') return sub * (q.discountValue / 100);
    return q.discountValue;
  }

  calcTax(q: QuoteDto): number {
    const items = q.quoteItems || [];
    const sub = this.calcSubTotal(q);
    const itemLevelDiscount = items.reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    const itemLevelTax = items.reduce((s, i) => {
      const lineTotal = i.quantity * i.unitPrice;
      const disc = lineTotal * ((i.discountPercentage || 0) / 100);
      return s + ((lineTotal - disc) * ((i.taxRate || 0) / 100));
    }, 0);
    const afterItemDisc = sub - itemLevelDiscount;
    const quoteDisc = this.calcQuoteDiscount(q);
    if (quoteDisc > 0 && afterItemDisc > 0) {
      return itemLevelTax * (1 - quoteDisc / afterItemDisc);
    }
    return itemLevelTax;
  }

  calcTotal(q: QuoteDto): number {
    const itemLevelDiscount = (q.quoteItems || []).reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    return this.calcSubTotal(q) - itemLevelDiscount - this.calcQuoteDiscount(q) + this.calcTax(q);
  }

  // ── Submit (create or update) final quote ──────────────────────────────────

  submitFinalQuote() {
    const items = this.quoteItemsSubject$.value;
    if (!this.workflowId || !this.customerId || items.length === 0) {
      this.errorMessage$.next('Please select a draft quote and ensure at least one line item exists.');
      return;
    }

    if (this.editingFinalQuote) {
      this.updateExistingFinalQuote(items);
    } else {
      this.createNewFinalQuote(items);
    }
  }

  private createNewFinalQuote(items: QuoteItemDisplay[]) {
    if (!this.selectedDraftQuote?.quoteId) {
      this.errorMessage$.next('No draft quote selected.');
      return;
    }

    const dto: CreateFinalQuoteDto = {
      draftQuoteId:  this.selectedDraftQuote.quoteId,
      quoteDate:     this.quoteDate,
      followUpDate:  this.followUpDate,
      notes:         this.notes,
      terms:         this.terms,
      discountType:  this.discountType  || undefined,
      discountValue: this.discountValue || 0,
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
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.createQuoteService.createFinalQuote(dto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (newQuote) => {
          // Guarantee draftQuoteId and isFinal are present so linkedFinalQuotes
          // filter works even if the backend omits them from the finalize response.
          const finalQuote: QuoteDto = {
            ...newQuote,
            isFinal:      true,
            draftQuoteId: newQuote.draftQuoteId ?? this.selectedDraftQuote!.quoteId
          };
          this.finalQuotesSubject$.next([...this.finalQuotesSubject$.value, finalQuote]);

          // Mark the in-memory draft as isFinal so the draft grid reflects the
          // locked state immediately without a reload.
          if (this.selectedDraftQuote) {
            const updatedDraft = { ...this.selectedDraftQuote, isFinal: true };
            this.selectedDraftQuote = updatedDraft;
            this.draftQuotesSubject$.next(
              this.draftQuotesSubject$.value.map(d =>
                d.quoteId === updatedDraft.quoteId ? updatedDraft : d
              )
            );
          }

          this.successMessage$.next(`Final Quote ${newQuote.quoteNumber} created successfully!`);

          const pdfBase64 = await this.generatePdf(newQuote);
          if (this.emailToCustomer) {
            this.sendQuoteEmail(newQuote, pdfBase64);
          }

          this.quoteItemsSubject$.next([]);
          this.resetAddonCheckboxes();
          this.discountType  = '';
          this.discountValue = 0;
        }),
        catchError(error => {
          this.errorMessage$.next(error.message || 'Error generating final quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  private updateExistingFinalQuote(items: QuoteItemDisplay[]) {
    const fq = this.editingFinalQuote!;
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
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.createQuoteService.updateQuote(fq.quoteId, updateDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (updatedQuote) => {
          // Preserve draftQuoteId so linkedFinalQuotes filter keeps working
          const enriched: QuoteDto = {
            ...updatedQuote,
            isFinal:      true,
            draftQuoteId: updatedQuote.draftQuoteId ?? fq.draftQuoteId
          };
          const updated = this.finalQuotesSubject$.value.map(q =>
            q.quoteId === enriched.quoteId ? enriched : q
          );
          this.finalQuotesSubject$.next(updated);
          this.editingFinalQuote = null;

          this.successMessage$.next(`Final Quote FINAL-${updatedQuote.quoteNumber} updated successfully!`);

          const pdfBase64 = await this.generatePdf(updatedQuote);
          if (this.emailToCustomer) {
            this.sendQuoteEmail(updatedQuote, pdfBase64);
          }

          // Clear the form — return to final grid view
          this.quoteItemsSubject$.next([]);
          this.resetAddonCheckboxes();
          this.discountType  = '';
          this.discountValue = 0;
        }),
        catchError(error => {
          this.errorMessage$.next(error.message || 'Error updating final quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  // ── Email ──────────────────────────────────────────────────────────────────

  private sendQuoteEmail(quote: QuoteDto, pdfBase64: string | null) {
    const toEmail = this.customerEmail;
    if (!toEmail) { this.errorMessage$.next('Cannot send email: no customer email address found.'); return; }
    const body = this.buildQuoteEmailBody(quote);
    const attachments: EmailAttachmentPayload[] = [];
    if (pdfBase64) {
      attachments.push({ fileName: `FinalQuote-FINAL-${quote.quoteNumber}.pdf`, base64Content: pdfBase64, contentType: 'application/pdf' });
    }
    const payload: SendDirectEmailPayload = {
      toEmail, toName: this.customerName,
      subject: `Your Final Quote FINAL-${quote.quoteNumber} from Awnings Ireland`,
      body, attachments: attachments.length > 0 ? attachments : undefined
    };
    this.isSendingEmail$.next(true);
    this.emailTaskService.sendDirectEmail(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({
        next: () => this.successMessage$.next(`Final Quote FINAL-${quote.quoteNumber} emailed to ${toEmail}` + (attachments.length > 0 ? ' with PDF attached' : '')),
        error: () => this.errorMessage$.next('Quote saved but email could not be sent.')
      });
  }

  private buildQuoteEmailBody(quote: QuoteDto): string {
    const items = quote.quoteItems || [];
    const lines = items.map(i => `  - ${i.description} (Qty: ${i.quantity}) — €${(i.quantity * i.unitPrice).toFixed(2)}`).join('\n');
    const subTotal = this.calcSubTotal(quote);
    const tax      = this.calcTax(quote);
    const total    = this.calcTotal(quote);
    return [
      `Dear ${this.customerName},`,
      '',
      `Please find your final quote reference FINAL-${quote.quoteNumber}.`,
      '',
      'Items:', lines, '',
      `Sub-Total : €${subTotal.toFixed(2)}`,
      `VAT       : €${tax.toFixed(2)}`,
      `Total     : €${total.toFixed(2)}`,
      '', this.terms, '',
      'Kind regards,', 'Awnings Ireland'
    ].join('\n');
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  private async generatePdf(quote: QuoteDto): Promise<string | null> {
    const items = this.quoteItemsSubject$.value;
    const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
    const itemLevelDiscount = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    let quoteLevelDiscount = 0;
    if (this.discountType && this.discountValue > 0) {
      quoteLevelDiscount = this.discountType === 'Percentage' ? subtotal * (this.discountValue / 100) : this.discountValue;
    }
    const totalDiscount = itemLevelDiscount + quoteLevelDiscount;
    const totalTax = items.reduce((sum, i) => {
      const sub = i.quantity * i.unitPrice;
      const disc = sub * ((i.discountPercentage || 0) / 100);
      return sum + ((sub - disc) * ((i.taxRate || 0) / 100));
    }, 0);
    const adjustedTax = quoteLevelDiscount > 0 && (subtotal - itemLevelDiscount) > 0
      ? totalTax * (1 - quoteLevelDiscount / (subtotal - itemLevelDiscount)) : totalTax;

    const pdfData: QuotePdfData = {
      quoteNumber:        `FINAL-${quote.quoteNumber}`,
      quoteDate:          typeof quote.quoteDate === 'string' ? quote.quoteDate : (quote.quoteDate as Date).toISOString(),
      expiryDate:         this.followUpDate,
      customerName:       this.customerName,
      customerAddress:    this.customerAddress    || '',
      customerCity:       this.customerCity       || '',
      customerPostalCode: this.customerPostalCode || '',
      reference:          this.selectedProductName || 'Final Awning Quote',
      items: items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, tax: i.taxRate || this.vatRate, amount: i.amount })),
      subtotal:  subtotal,
      discount:  totalDiscount > 0 ? totalDiscount : undefined,
      totalTax:  adjustedTax,
      taxRate:   this.vatRate,
      total:     subtotal - totalDiscount + adjustedTax,
      terms:     this.terms
    };

    if (typeof this.pdfService.generateQuotePdfAsBase64 === 'function') {
      return await this.pdfService.generateQuotePdfAsBase64(pdfData);
    }
    await this.pdfService.generateQuotePdf(pdfData);
    return null;
  }

  private async downloadQuotePdf(fq: QuoteDto) {
    const items  = fq.quoteItems || [];
    const subtotal        = this.calcSubTotal(fq);
    const itemDiscount    = items.reduce((s, i) => s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    const quoteDiscount   = this.calcQuoteDiscount(fq);
    const totalDiscount   = itemDiscount + quoteDiscount;
    const totalTax        = this.calcTax(fq);
    const followUp        = typeof fq.followUpDate === 'string'
      ? fq.followUpDate.split('T')[0]
      : (fq.followUpDate as Date).toISOString().split('T')[0];

    const pdfData: QuotePdfData = {
      quoteNumber:        fq.quoteNumber,
      quoteDate:          typeof fq.quoteDate === 'string' ? fq.quoteDate : (fq.quoteDate as Date).toISOString(),
      expiryDate:         followUp,
      customerName:       this.customerName,
      customerAddress:    this.customerAddress    || '',
      customerCity:       this.customerCity       || '',
      customerPostalCode: this.customerPostalCode || '',
      reference:          this.selectedProductName || 'Final Awning Quote',
      items: items.map(i => ({
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        tax:         i.taxRate || this.vatRate,
        amount:      i.quantity * i.unitPrice * (1 - (i.discountPercentage || 0) / 100)
      })),
      subtotal:  subtotal,
      discount:  totalDiscount > 0 ? totalDiscount : undefined,
      totalTax:  totalTax,
      taxRate:   this.vatRate,
      total:     this.calcTotal(fq),
      terms:     this.terms
    };

    await this.pdfService.generateQuotePdf(pdfData);
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  resetFormPartial() {
    this.quoteDate    = new Date().toISOString().split('T')[0];
    this.followUpDate = this.getDefaultFollowUpDate();
    this.notes        = '';
    this.terms        = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
    this.installationFee = 0;
    this.selectedBrackets = [];
    this.selectedMotor = '';
    this.selectedHeater = '';
    this.selectedLightingCassette = '';
    this.selectedControl = '';
    this.includeElectrician  = false;
    this.includeRalSurcharge = false;
    this.includeShadeplus    = false;
    this.shadePlusAllRows    = [];
    this.shadePlusOptions    = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeValanceStyle = false;
    this.includeWallSealing  = false;
    this.extrasDescription   = '';
    this.extrasPrice         = 0;
    this.enteredWidthCm      = null;
    this.selectedWidthCm     = null;
    this.selectedAwning      = null;
    this.discountType        = '';
    this.discountValue       = 0;
    this.editingFinalQuote   = null;
    this.quoteItemsSubject$.next([]);
    this.successMessage$.next('');
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

  private resetAddonCheckboxes() {
    this.selectedBrackets         = [];
    this.selectedMotor            = '';
    this.selectedHeater           = '';
    this.selectedLightingCassette = '';
    this.selectedControl          = '';
    this.includeElectrician       = false;
    this.includeRalSurcharge      = false;
    this.includeShadeplus         = false;
    this.includeValanceStyle      = false;
    this.includeWallSealing       = false;
  }
}
