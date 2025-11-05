import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductModel, QuoteItem, Supplier, Workflow } from '../../model/create-quote';

import { 
  CreateQuoteService, 
  CreateQuoteDto, 
  CreateQuoteItemDto, 
  QuoteDto,
  QuoteItemDto, 
} from '../../service/create-quote.service';
import { 
  WorkflowService, 
  SupplierDto, 
  ProductTypeDto, 
  ProductDto, 
  WorkflowDto,
  ArmDto,
  MotorDto,
  HeaterDto,
  BracketDto
} from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';

interface QuoteItemDisplay extends CreateQuoteItemDto {
  id?: number;
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
  // Workflow and selection data
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName: string = '';
  
  workflows: WorkflowDto[] = [];
  suppliers: SupplierDto[] = [];
  models: ProductDto[] = [];
  
  // Product addons
  brackets: BracketDto[] = [];
  arms: ArmDto[] = [];
  motors: MotorDto[] = [];
  heaters: HeaterDto[] = [];
  
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null = null;
  
  // Width and Projection data
  availableWidths: number[] = [];
  availableProjections: number[] = [];
  selectedWidthCm: number | null = null;
  selectedAwning: number | null = null;
  
  // Product details
  selectedProductName: string = '';
  calculatedPrice: number = 0;
  
  // Quote data
  quoteDate: string = new Date().toISOString().split('T')[0];
  followUpDate: string = this.getDefaultFollowUpDate();
  notes: string = '';
  terms: string = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
  
  // Customer address fields (you may need to get these from your customer service)
  customerAddress: string = '';
  customerCity: string = '';
  customerPostalCode: string = '';
  
  // Quote items
  quoteItems: QuoteItemDisplay[] = [];
  
  // Installation and addons
  installationFee: number = 0;
  vatRate: number = 13.5;
  selectedBrackets: string = '';
  selectedArms: string = '';
  selectedMotor: string = '';
  selectedHeater: string = '';
  includeElectrician: boolean = false;
  electricianPrice: number = 280.00;
  emailToCustomer: boolean = false;
  
  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  
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
    this.initializeComponent();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
          this.errorMessage = 'No customer selected. Please select a customer first.';
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
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (suppliers) => {
          this.suppliers = suppliers;
        },
        error: (error) => {
          console.error('Error loading suppliers:', error);
          this.errorMessage = 'Failed to load suppliers';
        }
      });
  }

  private loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null) {
    if (!this.customerId) return;

    this.isLoading = true;
    this.workflowService.getWorkflowsForCustomer(this.customerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workflows) => {
          this.workflows = workflows;
          this.isLoading = false;

          // Priority 1: Use preselected workflow ID from query params
          if (preselectedWorkflowId && this.workflows.some(w => w.workflowId === preselectedWorkflowId)) {
            this.selectedWorkflowId = preselectedWorkflowId;
            this.workflowId = preselectedWorkflowId;
            this.onWorkflowChange();
          }
          // Priority 2: Use workflow ID from workflow state service
          else if (this.selectedWorkflowId && this.workflows.some(w => w.workflowId === this.selectedWorkflowId)) {
            this.workflowId = this.selectedWorkflowId;
            this.onWorkflowChange();
          }
          // Priority 3: If only one workflow, select it
          else if (this.workflows.length === 1) {
            this.selectedWorkflowId = this.workflows[0].workflowId;
            this.workflowId = this.workflows[0].workflowId;
            this.onWorkflowChange();
          }
        },
        error: (error) => {
          console.error('Error loading workflows:', error);
          this.errorMessage = 'Failed to load workflows';
          this.isLoading = false;
        }
      });
  }

  onWorkflowChange() {
    if (!this.selectedWorkflowId) return;

    this.workflowId = this.selectedWorkflowId;
    const selectedWorkflow = this.workflows.find(w => w.workflowId == this.selectedWorkflowId);
    
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
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (brackets) => {
          this.brackets = brackets;
        },
        error: (error) => {
          console.error('Error loading brackets:', error);
        }
      });

    // Load arms
    this.workflowService.getArmsForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (arms) => {
          this.arms = arms;
        },
        error: (error) => {
          console.error('Error loading arms:', error);
        }
      });

    // Load motors
    this.workflowService.getMotorsForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (motors) => {
          this.motors = motors;
        },
        error: (error) => {
          console.error('Error loading motors:', error);
        }
      });

    // Load heaters
    this.workflowService.getHeatersForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (heaters) => {
          this.heaters = heaters;
        },
        error: (error) => {
          console.error('Error loading heaters:', error);
        }
      });
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedModelId) return;

    // Load standard widths
    this.workflowService.getStandardWidthsForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (widths) => {
          this.availableWidths = widths.sort((a, b) => a - b);
        },
        error: (error) => {
          console.error('Error loading widths:', error);
          this.errorMessage = 'Failed to load product widths';
        }
      });

    // Load projection widths
    this.workflowService.getProjectionWidthsForProduct(this.selectedModelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (projections) => {
          this.availableProjections = projections.sort((a, b) => a - b);
        },
        error: (error) => {
          console.error('Error loading projections:', error);
          this.errorMessage = 'Failed to load product projections';
        }
      });
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

    // Get price for this width and projection combination
    this.workflowService.getProjectionPriceForProduct(
      this.selectedModelId,
      this.selectedWidthCm,
      this.selectedAwning
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (price) => {
          this.calculatedPrice = price;
          this.generateFirstLineItem();
        },
        error: (error) => {
          console.error('Error getting price:', error);
          this.errorMessage = 'Failed to get price for selected dimensions';
        }
      });
  }

  private generateFirstLineItem() {
    if (!this.selectedWidthCm || !this.selectedAwning || !this.selectedProductName) {
      return;
    }

    // Convert cm to meters for display
    const widthM = (this.selectedWidthCm / 100).toFixed(1);
    const projectionM = (this.selectedAwning / 100).toFixed(0);

    // Create description matching the reference PDF format
    const description = `${this.selectedProductName} closed cassette awning\n${widthM}m wide x ${projectionM}m projection`;

    // Calculate amount: unit price * quantity * (1 + tax rate)
    const unitPrice = this.calculatedPrice;
    const taxRate = this.vatRate;
    const amount = this.calculateAmount(1, unitPrice, taxRate, 0);

    const firstLineItem: QuoteItemDisplay = {
      description: description,
      quantity: 1,
      unitPrice: unitPrice,
      taxRate: taxRate,
      discountPercentage: 0,
      amount: amount
    };

    // Check if first item is already auto-generated (main product)
    if (this.quoteItems.length > 0 && this.quoteItems[0].description.includes('wide x')) {
      this.quoteItems[0] = firstLineItem;
    } else {
      this.quoteItems.unshift(firstLineItem);
    }
  }

  onBracketChange() {
    if (!this.selectedBrackets) {
      this.removeAddonLineItem('bracket');
      return;
    }

    const bracket = this.brackets.find(b => b.bracketId.toString() === this.selectedBrackets);
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

    const arm = this.arms.find(a => a.armId.toString() === this.selectedArms);
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

    const motor = this.motors.find(m => m.motorId.toString() === this.selectedMotor);
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

    const heater = this.heaters.find(h => h.heaterId.toString() === this.selectedHeater);
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
    return taxableAmount; // Amount before tax (as per the reference PDF)
  }

  private addOrUpdateAddonLineItem(type: string, lineItem: QuoteItemDisplay) {
    const existingIndex = this.quoteItems.findIndex(item => item.id === lineItem.id);
    
    if (existingIndex !== -1) {
      this.quoteItems[existingIndex] = lineItem;
    } else {
      const insertIndex = this.getAddonInsertIndex(type);
      this.quoteItems.splice(insertIndex, 0, lineItem);
    }
  }

  private removeAddonLineItem(type: string) {
    const itemId = this.getAddonItemId(type);
    const index = this.quoteItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.quoteItems.splice(index, 1);
    }
  }

  private getAddonItemId(type: string): number {
    const typeIds: { [key: string]: number } = {
      'bracket': 100001,
      'arm': 100002,
      'motor': 100003,
      'heater': 100004,
      'electrician': 100005
    };
    return typeIds[type] || 0;
  }

  private getAddonInsertIndex(type: string): number {
    const typeOrder = ['bracket', 'arm', 'motor', 'heater', 'electrician'];
    const currentTypeIndex = typeOrder.indexOf(type);
    
    let insertIndex = 1;
    
    for (let i = 0; i < currentTypeIndex; i++) {
      const existingType = typeOrder[i];
      const exists = this.quoteItems.some(item => item.id === this.getAddonItemId(existingType));
      if (exists) {
        insertIndex++;
      }
    }
    
    return insertIndex;
  }

  onQuantityChange(item: QuoteItemDisplay) {
    const taxRate = item?.taxRate || 0;
    item.amount = this.calculateAmount(item.quantity, item.unitPrice, taxRate, item.discountPercentage || 0);
  }

  private getDefaultFollowUpDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 60); // 60 days expiry
    return date.toISOString().split('T')[0];
  }

  addQuoteItem() {
    this.quoteItems.push({
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: 0
    });
  }

  removeQuoteItem(index: number) {
    if (this.quoteItems.length > 1) {
      this.quoteItems.splice(index, 1);
    }
  }

  calculateItemAmount(item: QuoteItemDisplay): number {
    const taxRate = item?.taxRate || 0;
    return this.calculateAmount(item.quantity, item.unitPrice, taxRate, item.discountPercentage || 0);
  }

  onItemChange(item: QuoteItemDisplay) {
    item.amount = this.calculateItemAmount(item);
  }

  get subtotal(): number {
    return this.quoteItems.reduce((sum, item) => 
      sum + (item.quantity * item.unitPrice), 0
    );
  }

  get totalDiscount(): number {
    return this.quoteItems.reduce((sum, item) => {
      const discountPercentage = item?.discountPercentage || 0;
      const itemSubtotal = item.quantity * item.unitPrice;
      return sum + (itemSubtotal * (discountPercentage / 100));
    }, 0);
  }

  get totalTax(): number {
    return this.quoteItems.reduce((sum, item) => {
      const discountPercentage = item?.discountPercentage || 0;
      const taxRate = item?.taxRate || 0;
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscount = itemSubtotal * (discountPercentage / 100);
      const taxableAmount = itemSubtotal - itemDiscount;
      return sum + (taxableAmount * (taxRate / 100));
    }, 0);
  }

  get totalAmount(): number {
    return this.subtotal + this.totalTax;
  }

  isFormValid(): boolean {
    if (!this.workflowId || !this.customerId) return false;
    if (this.quoteItems.length === 0) return false;
    
    return this.quoteItems.every(item => 
      item.description.trim() !== '' && 
      item.quantity > 0 && 
      item.unitPrice >= 0
    );
  }

  generateQuote() {
    if (!this.isFormValid()) {
      this.errorMessage = 'Please fill in all required fields and ensure at least one quote item exists';
      return;
    }

    const createDto: CreateQuoteDto = {
      workflowId: this.workflowId!,
      customerId: this.customerId!,
      quoteDate: this.quoteDate,
      followUpDate: this.followUpDate,
      notes: this.notes,
      terms: this.terms,
      quoteItems: this.quoteItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0
      }))
    };

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.createQuoteService.createQuote(createDto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (createdQuote) => {
          console.log('Quote created successfully:', createdQuote);
          this.successMessage = `Quote ${createdQuote.quoteNumber} created successfully!`;
          
          // Generate PDF
          this.generatePdf(createdQuote);
          
          this.isLoading = false;
          
          setTimeout(() => {
            this.resetFormPartial();
          }, 2000);
        },
        error: (error) => {
          console.error('Error creating quote:', error);
          this.errorMessage = error.message || 'Error generating quote. Please try again.';
          this.isLoading = false;
        }
      });
  }

  private generatePdf(quote: QuoteDto) {
    const pdfData: QuotePdfData = {
      quoteNumber: quote.quoteNumber,
      quoteDate: (quote.quoteDate instanceof Date)?
                 quote.quoteDate.toLocaleDateString('en-GB') : quote.quoteDate,
      expiryDate: this.followUpDate,
      customerName: this.customerName,
      customerAddress: this.customerAddress || '12 OSWALD ROAD',
      customerCity: this.customerCity || 'DUBLIN 4',
      customerPostalCode: this.customerPostalCode || 'D04 X470',
      reference: this.selectedProductName || 'Awning Quote',
      items: this.quoteItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tax: item.taxRate || this.vatRate,
        amount: item.amount
      })),
      subtotal: this.subtotal,
      totalTax: this.totalTax,
      taxRate: this.vatRate,
      total: this.totalAmount,
      terms: this.terms
    };

    this.pdfService.generateQuotePdf(pdfData);
  }

  resetFormPartial() {
    this.quoteDate = new Date().toISOString().split('T')[0];
    this.followUpDate = this.getDefaultFollowUpDate();
    this.notes = '';
    this.terms = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
    
    const firstItem = this.quoteItems.find(item => 
      item.description.includes('wide x')
    );
    
    if (firstItem) {
      this.quoteItems = [firstItem];
    } else {
      this.quoteItems = [];
    }
    
    this.successMessage = '';
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