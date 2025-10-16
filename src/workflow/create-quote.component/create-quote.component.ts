import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { Quote, QuoteItem, Workflow, Supplier, ProductModel } from '../../model/create-quote';
import { CreateQuoteService } from '../../service/create-quote.service';

@Component({
  selector: 'app-create-quote.component',
  standalone:true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-quote.component.html',
  styleUrl: './create-quote.component.css'
})
export class CreateQuoteComponent {

  workflows: Workflow[] = [];
  suppliers: Supplier[] = [];
  models: ProductModel[] = [];
  quoteItems: QuoteItem[] = [];
  
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null = null;
  selectedWidthCm: number | null = null;
  selectedAwning: string = '';
  selectedBrackets: string = '';
  selectedArms: string = '';
  selectedMotor: string = '';
  
  installationFee: number = 0;
  vatRate: number = 13.5;
  emailToCustomer: boolean = false;
  attachBrochure: boolean = false;
  
  activeTab: string = 'create-quote';
  
  private destroy$ = new Subject<void>();

  constructor(
    private createQuoteService: CreateQuoteService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadWorkflows();
    this.loadSuppliers();
    this.loadQuoteItems();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWorkflows() {
   /** this.createQuoteService.getWorkflows()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (workflows) => {
          this.workflows = workflows;
        },
        error: (error) => console.error('Error loading workflows:', error)
      }); */
  }

  loadSuppliers() {
    this.createQuoteService.getSuppliers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (suppliers) => {
          this.suppliers = suppliers;
        },
        error: (error) => console.error('Error loading suppliers:', error)
      });
  }

  loadQuoteItems() {
    this.createQuoteService.getQuoteItems()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.quoteItems = items.map(item => ({
            ...item,
            amount: this.calculateItemAmount(item)
          }));
        },
        error: (error) => console.error('Error loading quote items:', error)
      });
  }

  onSupplierChange() {
    if (this.selectedSupplierId) {
      this.createQuoteService.getModelsBySupplier(this.selectedSupplierId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (models) => {
            this.models = models;
            this.selectedModelId = null;
          },
          error: (error) => console.error('Error loading models:', error)
        });
    }
  }

  calculateItemAmount(item: QuoteItem): number {
    return item.quantity * item.unitPrice;
  }

  get subtotal(): number {
    return this.quoteItems.reduce((sum, item) => sum + item.amount, 0);
  }

  get totalTax(): number {
    return (this.subtotal * this.vatRate) / 100;
  }

  get totalAmount(): number {
    return this.subtotal + this.totalTax;
  }

  onQuantityChange(item: QuoteItem) {
    item.amount = this.calculateItemAmount(item);
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  close() {
    this.router.navigate(['/workflow']);
  }

  generateQuote() {
    const selectedWorkflow = this.workflows.find(w => w.id === this.selectedWorkflowId);
    
    const quote: Quote = {
      workflowId: this.selectedWorkflowId!,
      workflowName: selectedWorkflow?.name || '',
      supplierId: this.selectedSupplierId!,
      modelId: this.selectedModelId!,
      widthCm: this.selectedWidthCm!,
      awningType: this.selectedAwning,
      brackets: this.selectedBrackets,
      arms: this.selectedArms,
      motor: this.selectedMotor,
      installationFee: this.installationFee,
      vatRate: this.vatRate,
      items: this.quoteItems,
      subtotal: this.subtotal,
      totalTax: this.totalTax,
      totalAmount: this.totalAmount,
      emailToCustomer: this.emailToCustomer,
      attachBrochure: this.attachBrochure
    };

    this.createQuoteService.createQuote(quote)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (createdQuote) => {
          console.log('Quote created successfully:', createdQuote);
          alert('Quote generated successfully!');
          this.router.navigate(['/workflow']);
        },
        error: (error) => {
          console.error('Error creating quote:', error);
          alert('Error generating quote. Please try again.');
        }
      });
  }
}
