import { Component, OnDestroy, OnInit } from '@angular/core';
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
} from '../../service/create-quote.service';
import {
  WorkflowService,
  SupplierDto,
  ProductDto,
  WorkflowDto,
  ArmDto,
  MotorDto,
  HeaterDto,
  BracketDto
} from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';
import { EmailTaskService, SendTaskEmailPayload } from '../../service/email-task.service';

interface QuoteItemDisplay {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  amount: number;
}

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
  arms$!: Observable<ArmDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
  availableWidths$!: Observable<number[]>;
  availableProjections$!: Observable<number[]>;
  quoteItems$!: Observable<QuoteItemDisplay[]>;
  subtotal$!: Observable<number>;
  quoteDiscount$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  isFormValid$!: Observable<boolean>;

  // ── State subjects ─────────────────────────────────────────────────────────
  isLoading$       = new BehaviorSubject<boolean>(false);
  isSendingEmail$  = new BehaviorSubject<boolean>(false);
  errorMessage$    = new BehaviorSubject<string>('');
  successMessage$  = new BehaviorSubject<string>('');

  private workflowsSubject$   = new BehaviorSubject<WorkflowDto[]>([]);
  private suppliersSubject$   = new BehaviorSubject<SupplierDto[]>([]);
  private bracketsSubject$    = new BehaviorSubject<BracketDto[]>([]);
  private armsSubject$        = new BehaviorSubject<ArmDto[]>([]);
  private motorsSubject$      = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$     = new BehaviorSubject<HeaterDto[]>([]);
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

  /** taskId of the first linked email task — used to send the quote email */
  private linkedTaskId: number | null = null;

  // ── Selection bindings ─────────────────────────────────────────────────────
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null    = null;
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

  // ── Addon selections ───────────────────────────────────────────────────────
  installationFee     = 0;
  vatRate             = 13.5;
  selectedBrackets    = '';
  selectedArms        = '';
  selectedMotor       = '';
  selectedHeater      = '';
  includeElectrician  = false;
  electricianPrice    = 280.00;

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

  // ── Observable setup ───────────────────────────────────────────────────────

  private initializeObservables() {
    this.workflows$          = this.workflowsSubject$.asObservable();
    this.suppliers$          = this.suppliersSubject$.asObservable();
    this.brackets$           = this.bracketsSubject$.asObservable();
    this.arms$               = this.armsSubject$.asObservable();
    this.motors$             = this.motorsSubject$.asObservable();
    this.heaters$            = this.heatersSubject$.asObservable();
    this.availableWidths$    = this.widthsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.quoteItems$         = this.quoteItemsSubject$.asObservable();

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
          this.errorMessage$.next('No customer selected. Please select a customer first.');
          return;
        }

        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        this.customerId    = selectedWorkflow?.customerId    || this.customerId;
        this.customerName  = selectedWorkflow?.customerName  || this.customerName;
        workflowId         = selectedWorkflow?.id            || paramWorkflowId || 0;

        this.loadWorkflowsForCustomer(workflowId);
        this.loadSuppliers();

        // Resolve a linked task so we can send email from it later
        if (this.customerId) this.resolveLinkedTaskId(this.customerId);
      });
  }

  /**
   * Loads the customer's email tasks and stores the first taskId.
   * Used when "Email Quote to Customer" is checked — we send via that task.
   */
  private resolveLinkedTaskId(customerId: number) {
    this.emailTaskService.getTasksByCustomer(customerId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(tasks => {
        if (tasks.length) {
          this.linkedTaskId = tasks[0].taskId;
          // If no customerEmail yet, populate from task
          if (!this.customerEmail && tasks[0].fromEmail) {
            this.customerEmail = tasks[0].fromEmail;
          }
        }
      });
  }

  // ── Loaders ────────────────────────────────────────────────────────────────

  private loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(takeUntil(this.destroy$),
        tap(s => this.suppliersSubject$.next(s)),
        catchError(() => { this.errorMessage$.next('Failed to load suppliers'); return of([]); }))
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
        catchError(() => { this.errorMessage$.next('Failed to load workflows'); return of([]); }),
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
    }
  }

  private loadProductAddons() {
    if (!this.selectedModelId) return;
    const id = this.selectedModelId;
    this.workflowService.getBracketsForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.bracketsSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getArmsForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.armsSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getMotorsForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.motorsSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getHeatersForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.heatersSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedModelId) return;
    const id = this.selectedModelId;
    this.workflowService.getStandardWidthsForProduct(id).pipe(takeUntil(this.destroy$), map(w => w.sort((a, b) => a - b)), tap(v => this.widthsSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getProjectionWidthsForProduct(id).pipe(takeUntil(this.destroy$), map(p => p.sort((a, b) => a - b)), tap(v => this.projectionsSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  // ── Dimension / addon handlers ─────────────────────────────────────────────

  onWidthChange()  { this.checkAndGenerateFirstLineItem(); }
  onAwningChange() { this.checkAndGenerateFirstLineItem(); }

  private checkAndGenerateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedModelId) return;
    this.workflowService.getProjectionPriceForProduct(this.selectedModelId, this.selectedWidthCm, this.selectedAwning)
      .pipe(takeUntil(this.destroy$), tap(price => { this.calculatedPrice = price; this.generateFirstLineItem(); }), catchError(() => { this.errorMessage$.next('Failed to get price'); return of(0); }))
      .subscribe();
  }

  private generateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedProductName) return;
    const widthM      = (this.selectedWidthCm / 100).toFixed(1);
    const projectionM = (this.selectedAwning  / 100).toFixed(0);
    const description = `${this.selectedProductName} closed cassette awning\n${widthM}m wide x ${projectionM}m projection`;
    const item: QuoteItemDisplay = {
      description, quantity: 1, unitPrice: this.calculatedPrice,
      taxRate: this.vatRate, discountPercentage: 0,
      amount: this.calculateAmount(1, this.calculatedPrice, this.vatRate, 0)
    };
    const current = this.quoteItemsSubject$.value;
    if (current.length > 0 && current[0].description.includes('wide x')) {
      current[0] = item; this.quoteItemsSubject$.next([...current]);
    } else {
      this.quoteItemsSubject$.next([item, ...current]);
    }
  }

  onBracketChange() {
    if (!this.selectedBrackets) { this.removeAddonLineItem('bracket'); return; }
    const bracket = this.bracketsSubject$.value.find(b => b.bracketId.toString() === this.selectedBrackets);
    if (bracket) this.addOrUpdateAddonLineItem('bracket', { description: bracket.bracketName, quantity: 1, unitPrice: bracket.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, bracket.price, this.vatRate, 0), id: this.getAddonItemId('bracket') });
  }

  onArmChange() {
    if (!this.selectedArms) { this.removeAddonLineItem('arm'); return; }
    const arm = this.armsSubject$.value.find(a => a.armId.toString() === this.selectedArms);
    if (arm) this.addOrUpdateAddonLineItem('arm', { description: arm.description, quantity: 1, unitPrice: arm.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, arm.price, this.vatRate, 0), id: this.getAddonItemId('arm') });
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

  onElectricianChange() {
    if (!this.includeElectrician) { this.removeAddonLineItem('electrician'); return; }
    this.addOrUpdateAddonLineItem('electrician', { description: 'Electric connection by our Qualified Electrician', quantity: 1, unitPrice: this.electricianPrice, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, this.electricianPrice, this.vatRate, 0), id: this.getAddonItemId('electrician') });
  }

  onInstallationFeeChange() {
    if (!this.installationFee || this.installationFee <= 0) { this.removeAddonLineItem('installation'); return; }
    const desc = this.selectedProductName ? `Supply and Fit ${this.selectedProductName}` : 'Supply and Fit';
    this.addOrUpdateAddonLineItem('installation', { description: desc, quantity: 1, unitPrice: this.installationFee, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, this.installationFee, this.vatRate, 0), id: this.getAddonItemId('installation') });
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
    if (items.length > 1) { items.splice(index, 1); this.quoteItemsSubject$.next([...items]); }
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

  // ── Generate quote ─────────────────────────────────────────────────────────

  generateQuote() {
    const items = this.quoteItemsSubject$.value;
    if (!this.workflowId || !this.customerId || items.length === 0) {
      this.errorMessage$.next('Please fill in all required fields and ensure at least one quote item exists');
      return;
    }

    const createDto: CreateQuoteDto = {
      workflowId:    this.workflowId!,
      customerId:    this.customerId!,
      quoteDate:     this.quoteDate,
      followUpDate:  this.followUpDate,
      notes:         this.notes,
      terms:         this.terms,
      // discount is optional — only include if the user has selected a type & value
      discountType:  this.discountType  || undefined,
      discountValue: this.discountValue || undefined,
      quoteItems: items.map(item => ({
        description:        item.description,
        quantity:           item.quantity,
        unitPrice:          item.unitPrice,
        taxRate:            item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0
      }))
    };

    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.createQuoteService.createQuote(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(createdQuote => {
          this.successMessage$.next(`Quote ${createdQuote.quoteNumber} created successfully!`);
          this.generatePdf(createdQuote);

          // ── Email quote to customer if checkbox ticked ──────────────────
          if (this.emailToCustomer) {
            this.sendQuoteEmail(createdQuote);
          }

          setTimeout(() => this.resetFormPartial(), 2000);
        }),
        catchError(error => {
          this.errorMessage$.next(error.message || 'Error generating quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  /**
   * Send the generated quote as an email to the customer.
   * Uses POST /api/EmailTask/{taskId}/send-email so the message goes via
   * the monitored mailbox configured in the backend.
   */
  private sendQuoteEmail(quote: QuoteDto) {
    const toEmail = this.customerEmail;
    if (!toEmail) {
      this.errorMessage$.next('Cannot send email: no customer email address found.');
      return;
    }

    const taskId = this.linkedTaskId;
    if (!taskId) {
      // No linked task — log a warning but don't block the user
      console.warn('[CreateQuote] No linked task found; quote email not sent.');
      this.successMessage$.next(this.successMessage$.value + ' (Email could not be sent — no linked task)');
      return;
    }

    const body = this.buildQuoteEmailBody(quote);
    const payload: SendTaskEmailPayload = {
      toEmail,
      toName:  this.customerName,
      subject: `Your Quote ${quote.quoteNumber} from Awnings Ireland`,
      body
    };

    this.isSendingEmail$.next(true);
    this.emailTaskService.sendTaskEmail(taskId, payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isSendingEmail$.next(false))
      )
      .subscribe({
        next: () => this.successMessage$.next(`Quote ${quote.quoteNumber} emailed to ${toEmail}`),
        error: ()  => this.errorMessage$.next('Quote saved but email could not be sent.')
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
      `Please find below your quote reference ${quote.quoteNumber}.`,
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

  private generatePdf(quote: QuoteDto) {
    const items = this.quoteItemsSubject$.value;
    const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
    const itemLevelDiscount = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice * (i.discountPercentage / 100)), 0);

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
      quoteNumber:      quote.quoteNumber,
      quoteDate:        quote.quoteDate instanceof Date ? quote.quoteDate.toLocaleDateString('en-GB') : quote.quoteDate,
      expiryDate:       this.followUpDate,
      customerName:     this.customerName,
      customerAddress:  this.customerAddress   || '12 OSWALD ROAD',
      customerCity:     this.customerCity      || 'DUBLIN 4',
      customerPostalCode: this.customerPostalCode || 'D04 X470',
      reference:        this.selectedProductName || 'Awning Quote',
      items: items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, tax: i.taxRate || this.vatRate, amount: i.amount })),
      subtotal:         subtotal,
      discount:         totalDiscount > 0 ? totalDiscount : undefined,
      totalTax:         adjustedTax,
      taxRate:          this.vatRate,
      total:            subtotal + adjustedTax,
      terms:            this.terms
    };

    this.pdfService.generateQuotePdf(pdfData);
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  resetFormPartial() {
    this.quoteDate   = new Date().toISOString().split('T')[0];
    this.followUpDate = this.getDefaultFollowUpDate();
    this.notes       = '';
    this.terms       = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
    const first = this.quoteItemsSubject$.value.find(i => i.description.includes('wide x'));
    this.quoteItemsSubject$.next(first ? [first] : []);
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

  private calculateAmount(qty: number, price: number, taxRate: number, discPct: number): number {
    const sub  = qty * price;
    const disc = sub * (discPct / 100);
    return sub - disc;
  }

  private addOrUpdateAddonLineItem(type: string, lineItem: QuoteItemDisplay) {
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
    const ids: { [k: string]: number } = { bracket: 100001, arm: 100002, motor: 100003, heater: 100004, electrician: 100005, installation: 100006 };
    return ids[type] || 0;
  }

  private getAddonInsertIndex(type: string): number {
    const order = ['bracket', 'arm', 'motor', 'heater', 'electrician', 'installation'];
    const items = this.quoteItemsSubject$.value;
    let idx = 1;
    for (let i = 0; i < order.indexOf(type); i++) {
      if (items.some(item => item.id === this.getAddonItemId(order[i]))) idx++;
    }
    return idx;
  }
}