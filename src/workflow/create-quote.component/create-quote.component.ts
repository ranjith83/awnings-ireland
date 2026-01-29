import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, takeUntil, tap, catchError, of, finalize } from 'rxjs';
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
  // Observables for data
  workflows$!: Observable<WorkflowDto[]>;
  suppliers$!: Observable<SupplierDto[]>;
  brackets$!: Observable<BracketDto[]>;
  arms$!: Observable<ArmDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
  availableWidths$!: Observable<number[]>;
  availableProjections$!: Observable<number[]>;
  quoteItems$!: Observable<QuoteItemDisplay[]>;
  
  // Computed observables for summary
  subtotal$!: Observable<number>;
  quoteDiscount$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  isFormValid$!: Observable<boolean>;
  
  // State management with BehaviorSubjects
  isLoading$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);
  private suppliersSubject$ = new BehaviorSubject<SupplierDto[]>([]);
  private bracketsSubject$ = new BehaviorSubject<BracketDto[]>([]);
  private armsSubject$ = new BehaviorSubject<ArmDto[]>([]);
  private motorsSubject$ = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$ = new BehaviorSubject<HeaterDto[]>([]);
  private widthsSubject$ = new BehaviorSubject<number[]>([]);
  private projectionsSubject$ = new BehaviorSubject<number[]>([]);
  private quoteItemsSubject$ = new BehaviorSubject<QuoteItemDisplay[]>([]);
  
  // Customer and workflow info
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName: string = '';
  customerAddress: string = '';
  customerCity: string = '';
  customerPostalCode: string = '';
  
  // Selection bindings for template
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null = null;
  selectedWidthCm: number | null = null;
  selectedAwning: number | null = null;
  selectedProductName: string = '';
  
  // Quote data
  quoteDate: string = new Date().toISOString().split('T')[0];
  followUpDate: string = this.getDefaultFollowUpDate();
  notes: string = '';
  terms: string = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
  
  // Discount fields
  discountType: string = ''; // 'Percentage' or 'Fixed'
  discountValue: number = 0;
  
  // Addon selections
  installationFee: number = 0;
  vatRate: number = 13.5;
  selectedBrackets: string = '';
  selectedArms: string = '';
  selectedMotor: string = '';
  selectedHeater: string = '';
  includeElectrician: boolean = false;
  electricianPrice: number = 280.00;
  emailToCustomer: boolean = false;
  
  calculatedPrice: number = 0;
  pageSize = 10;
  
  private destroy$ = new Subject<void>();

  constructor(
    private createQuoteService: CreateQuoteService,
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
    this.suppliers$ = this.suppliersSubject$.asObservable();
    this.brackets$ = this.bracketsSubject$.asObservable();
    this.arms$ = this.armsSubject$.asObservable();
    this.motors$ = this.motorsSubject$.asObservable();
    this.heaters$ = this.heatersSubject$.asObservable();
    this.availableWidths$ = this.widthsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.quoteItems$ = this.quoteItemsSubject$.asObservable();
    
    // Setup computed observables
    this.subtotal$ = this.quoteItems$.pipe(
      map(items => items.reduce((sum, item) => 
        sum + (item.quantity * item.unitPrice), 0
      ))
    );
    
    // Calculate quote-level discount
    this.quoteDiscount$ = this.subtotal$.pipe(
      map(subtotal => {
        if (!this.discountType || this.discountValue <= 0) return 0;
        
        if (this.discountType === 'Percentage') {
          return subtotal * (this.discountValue / 100);
        } else if (this.discountType === 'Fixed') {
          return this.discountValue;
        }
        return 0;
      })
    );
    
    this.totalTax$ = combineLatest([this.quoteItems$, this.quoteDiscount$, this.subtotal$]).pipe(
      map(([items, quoteDiscount, subtotal]) => {
        // Calculate item-level discounts and taxes
        const itemLevelTax = items.reduce((sum, item) => {
          const discountPercentage = item?.discountPercentage || 0;
          const taxRate = item?.taxRate || 0;
          const itemSubtotal = item.quantity * item.unitPrice;
          const itemDiscount = itemSubtotal * (discountPercentage / 100);
          const taxableAmount = itemSubtotal - itemDiscount;
          return sum + (taxableAmount * (taxRate / 100));
        }, 0);
        
        // Apply quote-level discount proportion to tax
        const itemLevelDiscount = items.reduce((sum, item) => 
          sum + ((item.quantity * item.unitPrice) * (item.discountPercentage / 100)), 0
        );
        const subtotalAfterItemDiscount = subtotal - itemLevelDiscount;
        
        if (quoteDiscount > 0 && subtotalAfterItemDiscount > 0) {
          const discountRatio = quoteDiscount / subtotalAfterItemDiscount;
          return itemLevelTax * (1 - discountRatio);
        }
        
        return itemLevelTax;
      })
    );
    
    this.totalAmount$ = combineLatest([this.subtotal$, this.quoteDiscount$, this.totalTax$, this.quoteItems$]).pipe(
      map(([subtotal, quoteDiscount, tax, items]) => {
        const itemLevelDiscount = items.reduce((sum, item) => 
          sum + ((item.quantity * item.unitPrice) * (item.discountPercentage / 100)), 0
        );
        return subtotal - itemLevelDiscount - quoteDiscount + tax;
      })
    );
    
    this.isFormValid$ = this.quoteItems$.pipe(
      map(items => {
        if (!this.workflowId || !this.customerId) return false;
        if (items.length === 0) return false;
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

        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
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

        this.loadWorkflowsForCustomer(workflowId);
        this.loadSuppliers();
      });
  }

  private loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(
        takeUntil(this.destroy$),
        tap(suppliers => this.suppliersSubject$.next(suppliers)),
        catchError(error => {
          console.error('Error loading suppliers:', error);
          this.errorMessage$.next('Failed to load suppliers');
          return of([]);
        })
      )
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
          
          // Priority 1: Use preselected workflow ID from query params
          if (preselectedWorkflowId && workflows.some(w => w.workflowId === preselectedWorkflowId)) {
            this.selectedWorkflowId = preselectedWorkflowId;
            this.workflowId = preselectedWorkflowId;
            this.onWorkflowChange();
          }
          // Priority 2: If only one workflow, select it
          else if (workflows.length === 1) {
            this.selectedWorkflowId = workflows[0].workflowId;
            this.workflowId = workflows[0].workflowId;
            this.onWorkflowChange();
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

  onWorkflowChange() {
    if (!this.selectedWorkflowId) return;

    this.workflowId = this.selectedWorkflowId;
    const workflows = this.workflowsSubject$.value;
    const selectedWorkflow = workflows.find(w => w.workflowId == this.selectedWorkflowId);
    
    if (selectedWorkflow) {
      this.selectedSupplierId = selectedWorkflow.supplierId;
      this.selectedModelId = selectedWorkflow.productId;
      this.selectedProductName = selectedWorkflow.productName;
      
      this.loadProductWidthsAndProjections();
      this.loadProductAddons();
    }
  }

   private loadProductAddons() {
    if (!this.selectedModelId) return;

    // Load brackets
    this.workflowService.getBracketsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(brackets => this.bracketsSubject$.next(brackets)),
        catchError(error => {
          console.error('Error loading brackets:', error);
          return of([]);
        })
      )
      .subscribe();

    // Load arms
    this.workflowService.getArmsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(arms => this.armsSubject$.next(arms)),
        catchError(error => {
          console.error('Error loading arms:', error);
          return of([]);
        })
      )
      .subscribe();

    // Load motors
    this.workflowService.getMotorsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(motors => this.motorsSubject$.next(motors)),
        catchError(error => {
          console.error('Error loading motors:', error);
          return of([]);
        })
      )
      .subscribe();

    // Load heaters
    this.workflowService.getHeatersForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        tap(heaters => this.heatersSubject$.next(heaters)),
        catchError(error => {
          console.error('Error loading heaters:', error);
          return of([]);
        })
      )
      .subscribe();
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedModelId) return;

    // Load standard widths
    this.workflowService.getStandardWidthsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        map(widths => widths.sort((a, b) => a - b)),
        tap(widths => this.widthsSubject$.next(widths)),
        catchError(error => {
          console.error('Error loading widths:', error);
          this.errorMessage$.next('Failed to load product widths');
          return of([]);
        })
      )
      .subscribe();

    // Load projection widths
    this.workflowService.getProjectionWidthsForProduct(this.selectedModelId)
      .pipe(
        takeUntil(this.destroy$),
        map(projections => projections.sort((a, b) => a - b)),
        tap(projections => this.projectionsSubject$.next(projections)),
        catchError(error => {
          console.error('Error loading projections:', error);
          this.errorMessage$.next('Failed to load product projections');
          return of([]);
        })
      )
      .subscribe();
  }

  onDiscountChange() {
    // Trigger recalculation
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  onInstallationFeeChange() {
    if (!this.installationFee || this.installationFee <= 0) {
      this.removeAddonLineItem('installation');
      return;
    }

    const amount = this.calculateAmount(1, this.installationFee, this.vatRate, 0);
    
    // Build description with product name
    const description = this.selectedProductName 
      ? `Supply and Fit ${this.selectedProductName}`
      : 'Supply and Fit';
    
    const lineItem: QuoteItemDisplay = {
      description: description,
      quantity: 1,
      unitPrice: this.installationFee,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: amount,
      id: this.getAddonItemId('installation')
    };

    this.addOrUpdateAddonLineItem('installation', lineItem);
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
    const amount = this.calculateAmount(1, unitPrice, this.vatRate, 0);

    const firstLineItem: QuoteItemDisplay = {
      description: description,
      quantity: 1,
      unitPrice: unitPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: amount
    };

    const currentItems = this.quoteItemsSubject$.value;
    
    if (currentItems.length > 0 && currentItems[0].description.includes('wide x')) {
      currentItems[0] = firstLineItem;
      this.quoteItemsSubject$.next([...currentItems]);
    } else {
      this.quoteItemsSubject$.next([firstLineItem, ...currentItems]);
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
      const amount = this.calculateAmount(1, bracket.price, this.vatRate, 0);
      
      const lineItem: QuoteItemDisplay = {
        description: bracket.bracketName,
        quantity: 1,
        unitPrice: bracket.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        amount: amount,
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
      const amount = this.calculateAmount(1, arm.price, this.vatRate, 0);
      
      const lineItem: QuoteItemDisplay = {
        description: arm.description,
        quantity: 1,
        unitPrice: arm.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        amount: amount,
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
      const amount = this.calculateAmount(1, motor.price, this.vatRate, 0);
      
      const lineItem: QuoteItemDisplay = {
        description: motor.description,
        quantity: 1,
        unitPrice: motor.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        amount: amount,
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
      const amount = this.calculateAmount(1, heater.price, this.vatRate, 0);
      
      const lineItem: QuoteItemDisplay = {
        description: heater.description,
        quantity: 1,
        unitPrice: heater.price,
        taxRate: this.vatRate,
        discountPercentage: 0,
        amount: amount,
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

    const amount = this.calculateAmount(1, this.electricianPrice, this.vatRate, 0);
    
    const lineItem: QuoteItemDisplay = {
      description: 'Electric connection by our Qualified Electrician',
      quantity: 1,
      unitPrice: this.electricianPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: amount,
      id: this.getAddonItemId('electrician')
    };

    this.addOrUpdateAddonLineItem('electrician', lineItem);
  }

  private calculateAmount(quantity: number, unitPrice: number, taxRate: number, discountPercentage: number): number {
    const subtotal = quantity * unitPrice;
    const discount = subtotal * (discountPercentage / 100);
    const taxableAmount = subtotal - discount;
    return taxableAmount;
  }

  private addOrUpdateAddonLineItem(type: string, lineItem: QuoteItemDisplay) {
    const currentItems = this.quoteItemsSubject$.value;
    const existingIndex = currentItems.findIndex(item => item.id === lineItem.id);
    
    if (existingIndex !== -1) {
      currentItems[existingIndex] = lineItem;
      this.quoteItemsSubject$.next([...currentItems]);
    } else {
      const insertIndex = this.getAddonInsertIndex(type);
      currentItems.splice(insertIndex, 0, lineItem);
      this.quoteItemsSubject$.next([...currentItems]);
    }
  }

  private removeAddonLineItem(type: string) {
    const itemId = this.getAddonItemId(type);
    const currentItems = this.quoteItemsSubject$.value;
    const index = currentItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      currentItems.splice(index, 1);
      this.quoteItemsSubject$.next([...currentItems]);
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
    const currentItems = this.quoteItemsSubject$.value;
    
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

  onQuantityChange(item: QuoteItemDisplay) {
    const taxRate = item?.taxRate || 0;
    item.amount = this.calculateAmount(item.quantity, item.unitPrice, taxRate, item.discountPercentage || 0);
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  private getDefaultFollowUpDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 60);
    return date.toISOString().split('T')[0];
  }

  addQuoteItem() {
    const currentItems = this.quoteItemsSubject$.value;
    currentItems.push({
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: 0
    });
    this.quoteItemsSubject$.next([...currentItems]);
  }

  removeQuoteItem(index: number) {
    const currentItems = this.quoteItemsSubject$.value;
    if (currentItems.length > 1) {
      currentItems.splice(index, 1);
      this.quoteItemsSubject$.next([...currentItems]);
    }
  }

  calculateItemAmount(item: QuoteItemDisplay): number {
    const taxRate = item?.taxRate || 0;
    return this.calculateAmount(item.quantity, item.unitPrice, taxRate, item.discountPercentage || 0);
  }

  onItemChange(item: QuoteItemDisplay) {
    item.amount = this.calculateItemAmount(item);
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  generateQuote() {
    const items = this.quoteItemsSubject$.value;
    
    if (!this.workflowId || !this.customerId || items.length === 0) {
      this.errorMessage$.next('Please fill in all required fields and ensure at least one quote item exists');
      return;
    }

    const createDto: CreateQuoteDto = {
      workflowId: this.workflowId!,
      customerId: this.customerId!,
      quoteDate: this.quoteDate,
      followUpDate: this.followUpDate,
      notes: this.notes,
      terms: this.terms,
      discountType: this.discountType || undefined,
      discountValue: this.discountValue || undefined,
      quoteItems: items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || this.vatRate,
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
          console.log('Quote created successfully:', createdQuote);
          this.successMessage$.next(`Quote ${createdQuote.quoteNumber} created successfully!`);
          this.generatePdf(createdQuote);
          
          setTimeout(() => {
            this.resetFormPartial();
          }, 2000);
        }),
        catchError(error => {
          console.error('Error creating quote:', error);
          this.errorMessage$.next(error.message || 'Error generating quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  private generatePdf(quote: QuoteDto) {
    const items = this.quoteItemsSubject$.value;
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const itemLevelDiscount = items.reduce((sum, item) => 
      sum + ((item.quantity * item.unitPrice) * (item.discountPercentage / 100)), 0
    );
    
    let quoteLevelDiscount = 0;
    if (this.discountType && this.discountValue > 0) {
      if (this.discountType === 'Percentage') {
        quoteLevelDiscount = subtotal * (this.discountValue / 100);
      } else if (this.discountType === 'Fixed') {
        quoteLevelDiscount = this.discountValue;
      }
    }
    
    const totalDiscount = itemLevelDiscount + quoteLevelDiscount;
    
    const totalTax = items.reduce((sum, item) => {
      const discountPercentage = item?.discountPercentage || 0;
      const taxRate = item?.taxRate || 0;
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscount = itemSubtotal * (discountPercentage / 100);
      const taxableAmount = itemSubtotal - itemDiscount;
      return sum + (taxableAmount * (taxRate / 100));
    }, 0);

    const adjustedTax = quoteLevelDiscount > 0 && (subtotal - itemLevelDiscount) > 0 
      ? totalTax * (1 - (quoteLevelDiscount / (subtotal - itemLevelDiscount)))
      : totalTax;

    const pdfData: QuotePdfData = {
      quoteNumber: quote.quoteNumber,
      quoteDate: (quote.quoteDate instanceof Date) ? 
                 quote.quoteDate.toLocaleDateString('en-GB') : quote.quoteDate,
      expiryDate: this.followUpDate,
      customerName: this.customerName,
      customerAddress: this.customerAddress || '12 OSWALD ROAD',
      customerCity: this.customerCity || 'DUBLIN 4',
      customerPostalCode: this.customerPostalCode || 'D04 X470',
      reference: this.selectedProductName || 'Awning Quote',
      items: items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tax: item.taxRate || this.vatRate,
        amount: item.amount
      })),
      subtotal: subtotal,
      discount: totalDiscount > 0 ? totalDiscount : undefined,
      totalTax: totalTax,
      taxRate: this.vatRate,
      total: subtotal + totalTax,
      terms: this.terms
    };

    this.pdfService.generateQuotePdf(pdfData);
  }

  resetFormPartial() {
    this.quoteDate = new Date().toISOString().split('T')[0];
    this.followUpDate = this.getDefaultFollowUpDate();
    this.notes = '';
    this.terms = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
    
    const currentItems = this.quoteItemsSubject$.value;
    const firstItem = currentItems.find(item => item.description.includes('wide x'));
    
    if (firstItem) {
      this.quoteItemsSubject$.next([firstItem]);
    } else {
      this.quoteItemsSubject$.next([]);
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