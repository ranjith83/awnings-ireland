import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { 
  InvoiceService,
  CreateInvoiceDto,
  CreateInvoiceItemDto,
  InvoiceDto
} from '../../service/invoice.service';

import { 
  CreateQuoteService, 
  QuoteDto,
  QuoteItemDto
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

interface InvoiceItemDisplay extends CreateInvoiceItemDto {
  id?: number;
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
  // Workflow and selection data
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName: string = '';
  
  workflows: WorkflowDto[] = [];
  quotes: QuoteDto[] = [];
  
  selectedWorkflowId: number | null = null;
  selectedQuoteId: number | null = null;
  selectedQuote: QuoteDto | null = null;
  selectedModelId: number | null = null;
  selectedProductName: string = '';
  
  // Product addons
  brackets: BracketDto[] = [];
  arms: ArmDto[] = [];
  motors: MotorDto[] = [];
  heaters: HeaterDto[] = [];
  
  // Width and Projection data
  availableWidths: number[] = [];
  availableProjections: number[] = [];
  selectedWidthCm: number | null = null;
  selectedAwning: number | null = null;
  
  // Selected addons
  selectedBrackets: string = '';
  selectedArms: string = '';
  selectedMotor: string = '';
  selectedHeater: string = '';
  includeElectrician: boolean = false;
  electricianPrice: number = 280.00;
  
  calculatedPrice: number = 0;
  
  // Invoice data
  invoiceDate: string = new Date().toISOString().split('T')[0];
  dueDate: string = this.getDefaultDueDate();
  invoiceStatus: string = 'Draft';
  notes: string = '';
  terms: string = 'Payment due within 30 days.\nLate payments subject to interest charges.';
  
  // Customer address fields
  customerAddress: string = '';
  customerCity: string = '';
  customerPostalCode: string = '';
  customerEmail: string = '';
  customerPhone: string = '';
  
  // Invoice items
  invoiceItems: InvoiceItemDisplay[] = [];
  
  // Installation and settings
  installationFee: number = 0;
  vatRate: number = 13.5;
  emailToCustomer: boolean = false;
  
  // UI state
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  
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
        this.customerEmail = params['customerEmail'] || '';
        this.customerPhone = params['customerPhone'] || '';

        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        const paramQuoteId = params['quoteId'] ? +params['quoteId'] : null;

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

        this.loadWorkflowsForCustomer(workflowId, paramQuoteId);
      });
  }

  private loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null, preselectedQuoteId: number | null = null) {
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
            this.onWorkflowChange(preselectedQuoteId);
          }
          // Priority 2: Use workflow ID from workflow state service
          else if (this.selectedWorkflowId && this.workflows.some(w => w.workflowId === this.selectedWorkflowId)) {
            this.workflowId = this.selectedWorkflowId;
            this.onWorkflowChange(preselectedQuoteId);
          }
          // Priority 3: If only one workflow, select it
          else if (this.workflows.length === 1) {
            this.selectedWorkflowId = this.workflows[0].workflowId;
            this.workflowId = this.workflows[0].workflowId;
            this.onWorkflowChange(preselectedQuoteId);
          }
        },
        error: (error) => {
          console.error('Error loading workflows:', error);
          this.errorMessage = 'Failed to load workflows';
          this.isLoading = false;
        }
      });
  }

  onWorkflowChange(preselectedQuoteId: number | null = null) {
    if (!this.selectedWorkflowId) return;

    this.workflowId = this.selectedWorkflowId;
    
    // Get workflow details to extract product info
    const selectedWorkflow = this.workflows.find(w => w.workflowId === this.selectedWorkflowId);
    if (selectedWorkflow) {
      this.selectedModelId = selectedWorkflow.productId;
      this.selectedProductName = selectedWorkflow.productName;
      
      // Load product data
      this.loadProductWidthsAndProjections();
      this.loadProductAddons();
    }
    
    this.quotes = [];
    this.selectedQuoteId = null;
    this.invoiceItems = [];
    this.resetSelections();

    // Load quotes for this workflow
    this.isLoading = true;
    this.quoteService.getQuotesByWorkflowId(this.selectedWorkflowId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quotes) => {
          this.quotes = quotes;
          this.isLoading = false;

          // If there's a preselected quote ID, select it
          if (preselectedQuoteId && this.quotes.some(q => q.quoteId === preselectedQuoteId)) {
            this.selectedQuoteId = preselectedQuoteId;
            this.onQuoteChange();
          }
          // If only one quote, select it automatically
          else if (this.quotes.length === 1) {
            this.selectedQuoteId = this.quotes[0].quoteId;
            this.onQuoteChange();
          }
        },
        error: (error) => {
          console.error('Error loading quotes:', error);
          this.errorMessage = 'Failed to load quotes for this workflow';
          this.isLoading = false;
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
        }
      });
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

  onQuoteChange() {
    if (!this.selectedQuoteId) return;

    this.isLoading = true;
    this.quoteService.getQuoteById(this.selectedQuoteId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (quote) => {
          this.selectedQuote = quote;
          this.loadInvoiceItemsFromQuote(quote);
          this.presetSelectionsFromQuote(quote);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading quote details:', error);
          this.errorMessage = 'Failed to load quote details';
          this.isLoading = false;
        }
      });
  }

  private loadInvoiceItemsFromQuote(quote: QuoteDto) {
    this.invoiceItems = quote.quoteItems.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discountPercentage: item.discountPercentage || 0,
      unit: 'pcs',
      totalPrice: this.calculateItemTotal(item.quantity, item.unitPrice, item.taxRate, item.discountPercentage || 0)
    }));

    /**
    // Load terms and notes from quote if available
    if (quote.notes) {
      this.notes = quote.notes;
    }
    if (quote.terms) {
      this.terms = quote.terms;
    }
       */
  }

  private presetSelectionsFromQuote(quote: QuoteDto) {
    // Parse the first line item to extract width and projection
    if (quote.quoteItems && quote.quoteItems.length > 0) {
      const firstItem = quote.quoteItems[0];
      const description = firstItem.description;
      
      // Extract width and projection from description
      // Format: "ProductName closed cassette awning\n3.5m wide x 3m projection"
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
      
      // Try to identify and preset addons from other line items
      quote.quoteItems.forEach((item, index) => {
        if (index === 0) return; // Skip first item (main product)
        
        const desc = item.description.toLowerCase();
        
        // Check for brackets
        const bracket = this.brackets.find(b => 
          desc.includes(b.bracketName.toLowerCase())
        );
        if (bracket) {
          this.selectedBrackets = bracket.bracketId.toString();
        }
        
        // Check for arms
        const arm = this.arms.find(a => 
          desc.includes(a.description.toLowerCase())
        );
        if (arm) {
          this.selectedArms = arm.armId.toString();
        }
        
        // Check for motors
        const motor = this.motors.find(m => 
          desc.includes(m.description.toLowerCase()) || 
          desc.includes('motor')
        );
        if (motor) {
          this.selectedMotor = motor.motorId.toString();
        }
        
        // Check for heaters
        const heater = this.heaters.find(h => 
          desc.includes(h.description.toLowerCase()) || 
          desc.includes('heater')
        );
        if (heater) {
          this.selectedHeater = heater.heaterId.toString();
        }
        
        // Check for electrician
        if (desc.includes('electric connection') || desc.includes('qualified electrician')) {
          this.includeElectrician = true;
          this.electricianPrice = item.unitPrice;
        }
        
        // Check for installation fee
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

    // Create description matching the reference format
    const description = `${this.selectedProductName} closed cassette awning\n${widthM}m wide x ${projectionM}m projection`;

    // Calculate amount
    const unitPrice = this.calculatedPrice;
    const taxRate = this.vatRate;
    const totalPrice = this.calculateItemTotal(1, unitPrice, taxRate, 0);

    const firstLineItem: InvoiceItemDisplay = {
      description: description,
      quantity: 1,
      unitPrice: unitPrice,
      taxRate: taxRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: totalPrice
    };

    // Check if first item is already auto-generated (main product)
    if (this.invoiceItems.length > 0 && this.invoiceItems[0].description.includes('wide x')) {
      this.invoiceItems[0] = firstLineItem;
    } else {
      this.invoiceItems.unshift(firstLineItem);
    }
  }

  onBracketChange() {
    if (!this.selectedBrackets) {
      this.removeAddonLineItem('bracket');
      return;
    }

    const bracket = this.brackets.find(b => b.bracketId.toString() === this.selectedBrackets);
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

    const arm = this.arms.find(a => a.armId.toString() === this.selectedArms);
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

    const motor = this.motors.find(m => m.motorId.toString() === this.selectedMotor);
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

    const heater = this.heaters.find(h => h.heaterId.toString() === this.selectedHeater);
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
    return taxableAmount; // Amount before tax
  }

  private addOrUpdateAddonLineItem(type: string, lineItem: InvoiceItemDisplay) {
    const existingIndex = this.invoiceItems.findIndex(item => item.id === lineItem.id);
    
    if (existingIndex !== -1) {
      this.invoiceItems[existingIndex] = lineItem;
    } else {
      const insertIndex = this.getAddonInsertIndex(type);
      this.invoiceItems.splice(insertIndex, 0, lineItem);
    }
  }

  private removeAddonLineItem(type: string) {
    const itemId = this.getAddonItemId(type);
    const index = this.invoiceItems.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.invoiceItems.splice(index, 1);
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
    
    let insertIndex = 1;
    
    for (let i = 0; i < currentTypeIndex; i++) {
      const existingType = typeOrder[i];
      const exists = this.invoiceItems.some(item => item.id === this.getAddonItemId(existingType));
      if (exists) {
        insertIndex++;
      }
    }
    
    return insertIndex;
  }

  private getDefaultDueDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 30); // 30 days payment terms
    return date.toISOString().split('T')[0];
  }

  addInvoiceItem() {
    this.invoiceItems.push({
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: this.vatRate,
      discountPercentage: 0,
      unit: 'pcs',
      totalPrice: 0
    });
  }

  removeInvoiceItem(index: number) {
    if (this.invoiceItems.length > 1) {
      this.invoiceItems.splice(index, 1);
    }
  }

  onQuantityChange(item: InvoiceItemDisplay) {
    const taxRate = item?.taxRate || 0;
    item.totalPrice = this.calculateItemTotal(
      item.quantity, 
      item.unitPrice, 
      taxRate, 
      item.discountPercentage || 0
    );
  }

  onItemChange(item: InvoiceItemDisplay) {
    const taxRate = item?.taxRate || 0;
    item.totalPrice = this.calculateItemTotal(
      item.quantity, 
      item.unitPrice, 
      taxRate, 
      item.discountPercentage || 0
    );
  }

  get subtotal(): number {
    return this.invoiceItems.reduce((sum, item) => 
      sum + (item.quantity * item.unitPrice), 0
    );
  }

  get totalDiscount(): number {
    return this.invoiceItems.reduce((sum, item) => {
      const discountPercentage = item.discountPercentage || 0;
      const itemSubtotal = item.quantity * item.unitPrice;
      return sum + (itemSubtotal * (discountPercentage / 100));
    }, 0);
  }

  get totalTax(): number {
    return this.invoiceItems.reduce((sum, item) => {
      const discountPercentage = item.discountPercentage || 0;
      const taxRate = item.taxRate || 0;
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
    if (this.invoiceItems.length === 0) return false;
    if (!this.invoiceDate || !this.dueDate) return false;
    
    return this.invoiceItems.every(item => 
      item.description.trim() !== '' && 
      item.quantity > 0 && 
      item.unitPrice >= 0
    );
  }

  generateInvoice() {
    if (!this.isFormValid()) {
      this.errorMessage = 'Please fill in all required fields and ensure at least one invoice item exists';
      return;
    }

    const createDto: CreateInvoiceDto = {
      workflowId: this.workflowId!,
      customerId: this.customerId!,
      invoiceDate: new Date(this.invoiceDate),
      dueDate: new Date(this.dueDate),
      notes: this.notes,
      terms: this.terms,
      invoiceItems: this.invoiceItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0,
        unit: item.unit || 'pcs'
      }))
    };

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.invoiceService.createInvoice(createDto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (createdInvoice) => {
          console.log('Invoice created successfully:', createdInvoice);
          this.successMessage = `Invoice ${createdInvoice.invoiceNumber} created successfully!`;
          
          // Generate PDF
          this.generatePdf(createdInvoice);
          
          // Send email if checkbox is checked
          if (this.emailToCustomer) {
            this.sendInvoiceEmail(createdInvoice.id);
          }
          
          this.isLoading = false;
          
          setTimeout(() => {
            this.resetFormPartial();
          }, 2000);
        },
        error: (error) => {
          console.error('Error creating invoice:', error);
          this.errorMessage = error.message || 'Error generating invoice. Please try again.';
          this.isLoading = false;
        }
      });
  }

  private generatePdf(invoice: InvoiceDto) {
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
      items: this.invoiceItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        tax: item.taxRate || this.vatRate,
        amount: item.totalPrice
      })),
      subtotal: this.subtotal,
      totalTax: this.totalTax,
      taxRate: this.vatRate,
      total: this.totalAmount,
      terms: this.terms,
      notes: this.notes,
      status: invoice.status,
      amountPaid: invoice.amountPaid || 0,
      amountDue: invoice.amountDue || this.totalAmount
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
          // Don't show error to user as the invoice was created successfully
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
    
    // Keep the items from the selected quote if available
    if (this.selectedQuote) {
      this.loadInvoiceItemsFromQuote(this.selectedQuote);
      this.presetSelectionsFromQuote(this.selectedQuote);
    } else {
      this.invoiceItems = [];
      this.resetSelections();
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