import { Component, OnDestroy, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, takeUntil, tap, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { 
  WorkflowService, 
  SupplierDto, 
  ProductDto,
  ProductTypeDto,
  ArmDto,
  MotorDto,
  HeaterDto,
  BracketDto
} from '../../service/workflow.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';

interface CalculatorItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

@Component({
  selector: 'app-quick-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-calculator.component.html',
  styleUrl: './quick-calculator.component.css'
})
export class QuickCalculatorComponent implements OnInit, OnDestroy {
  @Output() closeCalculator = new EventEmitter<void>();
  
  // Observables for data
  suppliers$!: Observable<SupplierDto[]>;
  productTypes$!: Observable<ProductTypeDto[]>;
  products$!: Observable<ProductDto[]>;
  brackets$!: Observable<BracketDto[]>;
  arms$!: Observable<ArmDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
  availableWidths$!: Observable<number[]>;
  availableProjections$!: Observable<number[]>;
  calculatorItems$!: Observable<CalculatorItem[]>;
  
  // Computed observables for summary
  subtotal$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  
  // State management with BehaviorSubjects
  private suppliersSubject$ = new BehaviorSubject<SupplierDto[]>([]);
  private productTypesSubject$ = new BehaviorSubject<ProductTypeDto[]>([]);
  private productsSubject$ = new BehaviorSubject<ProductDto[]>([]);
  private bracketsSubject$ = new BehaviorSubject<BracketDto[]>([]);
  private armsSubject$ = new BehaviorSubject<ArmDto[]>([]);
  private motorsSubject$ = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$ = new BehaviorSubject<HeaterDto[]>([]);
  private widthsSubject$ = new BehaviorSubject<number[]>([]);
  private projectionsSubject$ = new BehaviorSubject<number[]>([]);
  private calculatorItemsSubject$ = new BehaviorSubject<CalculatorItem[]>([]);
  
  // Selection bindings
  selectedSupplierId: number | null = null;
  selectedProductTypeId: number | null = null;
  selectedProductId: number | null = null;
  selectedWidthCm: number | null = null;
  selectedAwning: number | null = null;
  selectedProductName: string = '';
  
  // Addon selections
  installationFee: number = 0;
  vatRate: number = 13.5;
  selectedBrackets: string = '';
  selectedArms: string = '';
  selectedMotor: string = '';
  selectedHeater: string = '';
  includeElectrician: boolean = false;
  electricianPrice: number = 280.00;
  
  // Quick entry fields
  quickProductDescription: string = '';
  quickBasePrice: number = 0;
  quickQuantity: number = 1;
  
  calculatedPrice: number = 0;
  
  private destroy$ = new Subject<void>();

  constructor(
    private workflowService: WorkflowService,
    private pdfService: PdfGenerationService
  ) {}

  ngOnInit() {
    this.initializeObservables();
    this.loadSuppliers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeObservables() {
    this.suppliers$ = this.suppliersSubject$.asObservable();
    this.productTypes$ = this.productTypesSubject$.asObservable();
    this.products$ = this.productsSubject$.asObservable();
    this.brackets$ = this.bracketsSubject$.asObservable();
    this.arms$ = this.armsSubject$.asObservable();
    this.motors$ = this.motorsSubject$.asObservable();
    this.heaters$ = this.heatersSubject$.asObservable();
    this.availableWidths$ = this.widthsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.calculatorItems$ = this.calculatorItemsSubject$.asObservable();
    
    this.subtotal$ = this.calculatorItems$.pipe(
      map(items => items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0))
    );
    
    this.totalTax$ = this.calculatorItems$.pipe(
      map(items => items.reduce((sum, item) => {
        const itemSubtotal = item.quantity * item.unitPrice;
        return sum + (itemSubtotal * (item.taxRate / 100));
      }, 0))
    );
    
    this.totalAmount$ = this.subtotal$.pipe(
      map(subtotal => {
        const tax = this.calculatorItemsSubject$.value.reduce((sum, item) => {
          const itemSubtotal = item.quantity * item.unitPrice;
          return sum + (itemSubtotal * (item.taxRate / 100));
        }, 0);
        return subtotal + tax;
      })
    );
  }

  private loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(
        takeUntil(this.destroy$),
        tap(suppliers => this.suppliersSubject$.next(suppliers)),
        catchError(() => of([]))
      )
      .subscribe();
  }

  onSupplierChange() {
    if (!this.selectedSupplierId) return;
    
    this.workflowService.getAllProductTypesForSupplier(this.selectedSupplierId)
      .pipe(
        takeUntil(this.destroy$),
        tap(productstype => this.productTypesSubject$.next(productstype)),
        catchError(() => of([]))
      )
      .subscribe();
    
    this.resetCalculator();
  }

  onProductTypeChange() {
   if (!this.selectedSupplierId || !this.selectedProductTypeId) return;

     this.workflowService.getAllProductsBySupplier(this.selectedSupplierId, this.selectedProductTypeId)
      .pipe(
        takeUntil(this.destroy$),
        tap(products => this.productsSubject$.next(products)),
        catchError(() => of([]))
      )
      .subscribe();
    this.resetCalculator();     
  }
  

  onProductChange() {
    if (!this.selectedProductId) return;
    
    const products = this.productsSubject$.value;
    const product = products.find(p => p.productId === this.selectedProductId);
    if (product) {
      this.selectedProductName = product.productName;
    }
    
    this.loadProductWidthsAndProjections();
    this.loadProductAddons();
    this.resetCalculator();
  }

  private loadProductAddons() {
    if (!this.selectedProductId) return;

    this.workflowService.getBracketsForProduct(this.selectedProductId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(brackets => this.bracketsSubject$.next(brackets));

    this.workflowService.getArmsForProduct(this.selectedProductId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(arms => this.armsSubject$.next(arms));

    this.workflowService.getMotorsForProduct(this.selectedProductId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(motors => this.motorsSubject$.next(motors));

    this.workflowService.getHeatersForProduct(this.selectedProductId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(heaters => this.heatersSubject$.next(heaters));
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedProductId) return;

    this.workflowService.getStandardWidthsForProduct(this.selectedProductId)
      .pipe(
        takeUntil(this.destroy$),
        map(widths => widths.sort((a, b) => a - b)),
        catchError(() => of([]))
      )
      .subscribe(widths => this.widthsSubject$.next(widths));

    this.workflowService.getProjectionWidthsForProduct(this.selectedProductId)
      .pipe(
        takeUntil(this.destroy$),
        map(projections => projections.sort((a, b) => a - b)),
        catchError(() => of([]))
      )
      .subscribe(projections => this.projectionsSubject$.next(projections));
  }

  onWidthChange() {
    this.checkAndGenerateFirstLineItem();
  }

  onAwningChange() {
    this.checkAndGenerateFirstLineItem();
  }

  private checkAndGenerateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedProductId) {
      return;
    }

    this.workflowService.getProjectionPriceForProduct(
      this.selectedProductId,
      this.selectedWidthCm,
      this.selectedAwning
    )
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of(0))
      )
      .subscribe(price => {
        this.calculatedPrice = price;
        this.generateFirstLineItem();
      });
  }

  private generateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedProductName) return;

    const widthM = (this.selectedWidthCm / 100).toFixed(1);
    const projectionM = (this.selectedAwning / 100).toFixed(0);
    const description = `${this.selectedProductName} closed cassette awning\n${widthM}m wide x ${projectionM}m projection`;

    const firstLineItem: CalculatorItem = {
      description,
      quantity: 1,
      unitPrice: this.calculatedPrice,
      taxRate: this.vatRate,
      amount: this.calculatedPrice
    };

    const currentItems = this.calculatorItemsSubject$.value;
    if (currentItems.length > 0 && currentItems[0].description.includes('wide x')) {
      currentItems[0] = firstLineItem;
      this.calculatorItemsSubject$.next([...currentItems]);
    } else {
      this.calculatorItemsSubject$.next([firstLineItem, ...currentItems]);
    }
  }

  onBracketChange() {
    if (!this.selectedBrackets) {
      this.removeAddonItem('bracket');
      return;
    }

    const bracket = this.bracketsSubject$.value.find(b => b.bracketId.toString() === this.selectedBrackets);
    if (bracket) {
      this.addOrUpdateAddonItem('bracket', {
        description: bracket.bracketName,
        quantity: 1,
        unitPrice: bracket.price,
        taxRate: this.vatRate,
        amount: bracket.price
      });
    }
  }

  onArmChange() {
    if (!this.selectedArms) {
      this.removeAddonItem('arm');
      return;
    }

    const arm = this.armsSubject$.value.find(a => a.armId.toString() === this.selectedArms);
    if (arm) {
      this.addOrUpdateAddonItem('arm', {
        description: arm.description,
        quantity: 1,
        unitPrice: arm.price,
        taxRate: this.vatRate,
        amount: arm.price
      });
    }
  }

  onMotorChange() {
    if (!this.selectedMotor) {
      this.removeAddonItem('motor');
      return;
    }

    const motor = this.motorsSubject$.value.find(m => m.motorId.toString() === this.selectedMotor);
    if (motor) {
      this.addOrUpdateAddonItem('motor', {
        description: motor.description,
        quantity: 1,
        unitPrice: motor.price,
        taxRate: this.vatRate,
        amount: motor.price
      });
    }
  }

  onHeaterChange() {
    if (!this.selectedHeater) {
      this.removeAddonItem('heater');
      return;
    }

    const heater = this.heatersSubject$.value.find(h => h.heaterId.toString() === this.selectedHeater);
    if (heater) {
      this.addOrUpdateAddonItem('heater', {
        description: heater.description,
        quantity: 1,
        unitPrice: heater.price,
        taxRate: this.vatRate,
        amount: heater.price
      });
    }
  }

  onElectricianChange() {
    if (!this.includeElectrician) {
      this.removeAddonItem('electrician');
      return;
    }

    this.addOrUpdateAddonItem('electrician', {
      description: 'Electric connection by our Qualified Electrician',
      quantity: 1,
      unitPrice: this.electricianPrice,
      taxRate: this.vatRate,
      amount: this.electricianPrice
    });
  }

  onInstallationFeeChange() {
    if (!this.installationFee || this.installationFee <= 0) {
      this.removeAddonItem('installation');
      return;
    }

    this.addOrUpdateAddonItem('installation', {
      description: 'Installation Fee',
      quantity: 1,
      unitPrice: this.installationFee,
      taxRate: this.vatRate,
      amount: this.installationFee
    });
  }

  onQuickPriceChange() {
    if (!this.quickProductDescription || !this.quickBasePrice || this.quickBasePrice <= 0) {
      // Remove the main item if invalid
      const currentItems = this.calculatorItemsSubject$.value;
      const filtered = currentItems.filter(item => 
        !item.description.includes(this.quickProductDescription) &&
        item.description !== 'Electric connection' &&
        item.description !== 'Installation Fee'
      );
      this.calculatorItemsSubject$.next(filtered);
      return;
    }

    const quantity = this.quickQuantity || 1;
    const mainItem: CalculatorItem = {
      description: this.quickProductDescription,
      quantity: quantity,
      unitPrice: this.quickBasePrice,
      taxRate: this.vatRate,
      amount: this.quickBasePrice * quantity
    };

    const currentItems = this.calculatorItemsSubject$.value;
    
    // Check if main item exists
    const mainItemIndex = currentItems.findIndex(item => 
      item.description === this.quickProductDescription ||
      (currentItems[0] && !currentItems[0].description.includes('Electric') && 
       !currentItems[0].description.includes('Installation'))
    );
    
    if (mainItemIndex === 0 || mainItemIndex > -1) {
      currentItems[mainItemIndex] = mainItem;
      this.calculatorItemsSubject$.next([...currentItems]);
    } else {
      this.calculatorItemsSubject$.next([mainItem, ...currentItems]);
    }
  }

  private addOrUpdateAddonItem(type: string, item: CalculatorItem) {
    const currentItems = this.calculatorItemsSubject$.value;
    const existingIndex = currentItems.findIndex(i => i.description === item.description);
    
    if (existingIndex !== -1) {
      currentItems[existingIndex] = item;
    } else {
      const insertIndex = this.getAddonInsertIndex(type);
      currentItems.splice(insertIndex, 0, item);
    }
    
    this.calculatorItemsSubject$.next([...currentItems]);
  }

  private removeAddonItem(type: string) {
    const typeDescriptions: { [key: string]: string } = {
      'bracket': 'bracket',
      'arm': 'arm',
      'motor': 'motor',
      'heater': 'heater',
      'electrician': 'Electric connection',
      'installation': 'Installation Fee'
    };
    
    const currentItems = this.calculatorItemsSubject$.value;
    const index = currentItems.findIndex(item => 
      item.description.toLowerCase().includes(typeDescriptions[type].toLowerCase())
    );
    
    if (index !== -1) {
      currentItems.splice(index, 1);
      this.calculatorItemsSubject$.next([...currentItems]);
    }
  }

  private getAddonInsertIndex(type: string): number {
    const typeOrder = ['bracket', 'arm', 'motor', 'heater', 'electrician', 'installation'];
    const currentTypeIndex = typeOrder.indexOf(type);
    return Math.min(currentTypeIndex + 1, this.calculatorItemsSubject$.value.length);
  }

  onQuantityChange(item: CalculatorItem) {
    item.amount = item.quantity * item.unitPrice;
    this.calculatorItemsSubject$.next([...this.calculatorItemsSubject$.value]);
  }

  onItemChange(item: CalculatorItem) {
    item.amount = item.quantity * item.unitPrice;
    this.calculatorItemsSubject$.next([...this.calculatorItemsSubject$.value]);
  }

  addCustomItem() {
    const currentItems = this.calculatorItemsSubject$.value;
    currentItems.push({
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: this.vatRate,
      amount: 0
    });
    this.calculatorItemsSubject$.next([...currentItems]);
  }

  removeItem(index: number) {
    const currentItems = this.calculatorItemsSubject$.value;
    currentItems.splice(index, 1);
    this.calculatorItemsSubject$.next([...currentItems]);
  }
  private getDefaultFollowUpDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 60);
    return date.toISOString().split('T')[0];
  }

  generateEstimatePdf() {
    const items = this.calculatorItemsSubject$.value;
    if (items.length === 0) return;

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalTax = items.reduce((sum, item) => {
      const itemSubtotal = item.quantity * item.unitPrice;
      return sum + (itemSubtotal * (item.taxRate / 100));
    }, 0);

    const pdfData: QuotePdfData = {
      quoteNumber: 'ESTIMATE-' + new Date().getTime(),
      quoteDate: new Date().toLocaleDateString('en-GB'),
      expiryDate: this.getDefaultFollowUpDate(),
      customerName: 'Phone Enquiry',
      customerAddress: '',
      customerCity: '',
      customerPostalCode: '',
      reference: this.selectedProductName || 'Quick Estimate',
      items: items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tax: item.taxRate,
        amount: item.amount
      })),
      subtotal,
      totalTax,
      taxRate: this.vatRate,
      total: subtotal + totalTax,
      terms: 'This is an estimate only. Final quote subject to site survey.'
    };

    this.pdfService.generateQuotePdf(pdfData);
  }

  resetCalculator() {
    this.selectedWidthCm = null;
    this.selectedAwning = null;
    this.selectedBrackets = '';
    this.selectedArms = '';
    this.selectedMotor = '';
    this.selectedHeater = '';
    this.includeElectrician = false;
    this.installationFee = 0;
    this.calculatedPrice = 0;
    this.quickProductDescription = '';
    this.quickBasePrice = 0;
    this.quickQuantity = 1;
    this.calculatorItemsSubject$.next([]);
  }

  clearAll() {
    this.selectedSupplierId = null;
    this.selectedProductTypeId = null;
    this.selectedProductId = null;
    this.selectedProductName = '';
    this.productTypesSubject$.next([]);
    this.productsSubject$.next([]);
    this.widthsSubject$.next([]);
    this.projectionsSubject$.next([]);
    this.bracketsSubject$.next([]);
    this.armsSubject$.next([]);
    this.motorsSubject$.next([]);
    this.heatersSubject$.next([]);
    this.resetCalculator();
  }

  close() {
    this.clearAll();
    this.closeCalculator.emit();
  }
}