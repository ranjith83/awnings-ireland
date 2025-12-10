import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, takeUntil, tap, catchError, of, finalize } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

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
  ArmDto,
  MotorDto,
  HeaterDto,
  BracketDto
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

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice.component.html',
  styleUrl: './invoice.component.css'
})
export class InvoiceComponent implements OnInit, OnDestroy {
  // Observables for data
  workflows$!: Observable<WorkflowDto[]>;
  quotes$!: Observable<QuoteDto[]>;
  brackets$!: Observable<BracketDto[]>;
  arms$!: Observable<ArmDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
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
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);
  private quotesSubject$ = new BehaviorSubject<QuoteDto[]>([]);
  private bracketsSubject$ = new BehaviorSubject<BracketDto[]>([]);
  private armsSubject$ = new BehaviorSubject<ArmDto[]>([]);
  private motorsSubject$ = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$ = new BehaviorSubject<HeaterDto[]>([]);
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
  selectedWidthCm: number | null = null;
  selectedAwning: number | null = null;
  selectedProductName: string = '';
  
  // Invoice data
  invoiceDate: string = new Date().toISOString().split('T')[0];
  dueDate: string = this.getDefaultDueDate();
  invoiceStatus: string = 'Draft';
  notes: string = '';
  terms: string = 'Payment due within 30 days.\nLate payments subject to interest charges.';
  
  // Addon selections
  selectedBrackets: string = '';
  selectedArms: string = '';
  selectedMotor: string = '';
  selectedHeater: string = '';
  includeElectrician: boolean = false;
  electricianPrice: number = 280.00;
  installationFee: number = 0;
  vatRate: number = 13.5;
  emailToCustomer: boolean = false;
  
  calculatedPrice: number = 0;
  
  private destroy$ = new Subject<void>();

  constructor(
    private invoiceService: InvoiceService,
    private quoteService: CreateQuoteService,
    private workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService,
    private pdfService: PdfGenerationService,
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

  private initializeObservables() {
    // Setup observables from subjects
    this.workflows$ = this.workflowsSubject$.asObservable();
    this.quotes$ = this.quotesSubject$.asObservable();
    this.brackets$ = this.bracketsSubject$.asObservable();
    this.arms$ = this.armsSubject$.asObservable();
    this.motors$ = this.motorsSubject$.asObservable();
    this.heaters$ = this.heatersSubject$.asObservable();
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
          this.errorMessage$.next('No customer selected. Please select a customer first.');
          return;
        }

        if (this.customerId) {
          const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
          this.customerId = selectedWorkflow?.customerId || null;
          this.customerName = selectedWorkflow?.customerName || '';
          workflowId = selectedWorkflow?.id || 0;
        }

        this.loadWorkflowsForCustomer(workflowId, paramQuoteId);
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
          this.errorMessage$.next('Failed to load workflows');
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
          this.errorMessage$.next('Failed to load quotes for this workflow');
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

    this.workflowService.getBracketsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(brackets => this.bracketsSubject$.next(brackets)),
        catchError(() => of([]))
      )
      .subscribe();

    this.workflowService.getArmsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(arms => this.armsSubject$.next(arms)),
        catchError(() => of([]))
      )
      .subscribe();

    this.workflowService.getMotorsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(motors => this.motorsSubject$.next(motors)),
        catchError(() => of([]))
      )
      .subscribe();

    this.workflowService.getHeatersForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(heaters => this.heatersSubject$.next(heaters)),
        catchError(() => of([]))
      )
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
          this.errorMessage$.next('Failed to load quote details');
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
        this.selectedWidthCm = Math.round(widthM * 100);
      }
      
      if (projectionMatch) {
        const projectionM = parseFloat(projectionMatch[1]);
        this.selectedAwning = Math.round(projectionM * 100);
      }
      
      const brackets = this.bracketsSubject$.value;
      const arms = this.armsSubject$.value;
      const motors = this.motorsSubject$.value;
      const heaters = this.heatersSubject$.value;
      
      quote.quoteItems.forEach((item, index) => {
        if (index === 0) return;
        
        const desc = item.description.toLowerCase();
        
        const bracket = brackets.find(b => desc.includes(b.bracketName.toLowerCase()));
        if (bracket) this.selectedBrackets = bracket.bracketId.toString();
        
        const arm = arms.find(a => desc.includes(a.description.toLowerCase()));
        if (arm) this.selectedArms = arm.armId.toString();
        
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
    this.selectedWidthCm = null;
    this.selectedAwning = null;
    this.selectedBrackets = '';
    this.selectedArms = '';
    this.selectedMotor = '';
    this.selectedHeater = '';
    this.includeElectrician = false;
    this.installationFee = 0;
  }

  onWidthChange() {
    this.checkAndGenerateFirstLineItem();
  }

  onAwningChange() {
    this.checkAndGenerateFirstLineItem();
  }

  private checkAndGenerateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedModelId) {
      return;
    }

    this.workflowService.getProjectionPriceForProduct(
      this.selectedModelId,
      this.selectedWidthCm,
      this.selectedAwning
    )
      .pipe(
        takeUntil(this.destroy$),
        tap(price => {
          this.calculatedPrice = price;
          this.generateFirstLineItem();
        }),
        catchError(error => {
          console.error('Error getting price:', error);
          this.errorMessage$.next('Failed to get price for selected dimensions');
          return of(0);
        })
      )
      .subscribe();
  }

  private generateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedProductName) {
      return;
    }

    const widthM = (this.selectedWidthCm / 100).toFixed(1);
    const projectionM = (this.selectedAwning / 100).toFixed(0);
    const description = `${this.selectedProductName} closed cassette awning\n${widthM}m wide x ${projectionM}m projection`;
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
    if (!this.selectedBrackets) {
      this.removeAddonLineItem('bracket');
      return;
    }

    const brackets = this.bracketsSubject$.value;
    const bracket = brackets.find(b => b.bracketId.toString() === this.selectedBrackets);
    if (bracket) {
      const totalPrice = this.calculateItemTotal(1, bracket.price, this.vatRate, 0);
      
      const lineItem: InvoiceItemDisplay = {
        description: bracket.bracketName,
        quantity: 1,
        unitPrice: bracket.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        unit: 'pcs',
        totalPrice: totalPrice,
        id: this.getAddonItemId('bracket')
      };

      this.addOrUpdateAddonLineItem('bracket', lineItem);
    }
  }

  onArmChange() {
    if (!this.selectedArms) {
      this.removeAddonLineItem('arm');
      return;
    }

    const arms = this.armsSubject$.value;
    const arm = arms.find(a => a.armId.toString() === this.selectedArms);
    if (arm) {
      const totalPrice = this.calculateItemTotal(1, arm.price, this.vatRate, 0);
      
      const lineItem: InvoiceItemDisplay = {
        description: arm.description,
        quantity: 1,
        unitPrice: arm.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        unit: 'pcs',
        totalPrice: totalPrice,
        id: this.getAddonItemId('arm')
      };

      this.addOrUpdateAddonLineItem('arm', lineItem);
    }
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
      'bracket': 100001,
      'arm': 100002,
      'motor': 100003,
      'heater': 100004,
      'electrician': 100005,
      'installation': 100006
    };
    return typeIds[type] || 0;
  }

  private getAddonInsertIndex(type: string): number {
    const typeOrder = ['bracket', 'arm', 'motor', 'heater', 'electrician', 'installation'];
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
    if (currentItems.length > 1) {
      currentItems.splice(index, 1);
      this.invoiceItemsSubject$.next([...currentItems]);
    }
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
      this.errorMessage$.next('Please fill in all required fields and ensure at least one invoice item exists');
      return;
    }

    const createDto: CreateInvoiceDto = {
      workflowId: this.workflowId!,
      customerId: this.customerId!,
      invoiceDate: new Date(this.invoiceDate),
      dueDate: new Date(this.dueDate),
      notes: this.notes,
      terms: this.terms,
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
    this.errorMessage$.next('');
    this.successMessage$.next('');

    this.invoiceService.createInvoice(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(createdInvoice => {
          console.log('Invoice created successfully:', createdInvoice);
          this.successMessage$.next(`Invoice ${createdInvoice.invoiceNumber} created successfully!`);
          
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
          this.errorMessage$.next(error.message || 'Error generating invoice. Please try again.');
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
    
    this.successMessage$.next('');
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