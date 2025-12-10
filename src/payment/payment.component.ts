import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, catchError, finalize, of, takeUntil, tap } from 'rxjs';
import { InvoiceService, InvoiceDto } from '../service/invoice.service';
import { 
  PaymentScheduleService,
  PaymentScheduleDto,
  CreatePaymentScheduleDto,
  CreatePaymentScheduleItemDto,
  RecordSchedulePaymentDto
} from '../service/payment-schedule.service';

type ProductCategory = 'Renson' | 'Awnings' | 'Stock Items';

interface PaymentTemplate {
  category: ProductCategory;
  splits: {
    description: string;
    percentage: number;
    daysFromInvoice: number;
  }[];
}

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment.component.html',
  styleUrls: ['./payment.component.css']
})
export class PaymentComponent implements OnInit, OnDestroy {
  // Observables
  paymentSchedule$!: Observable<PaymentScheduleDto[]>;
  invoices$!: Observable<InvoiceDto[]>;
  
  // State management
  isLoading$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  
  private scheduleSubject$ = new BehaviorSubject<PaymentScheduleDto[]>([]);
  private invoicesSubject$ = new BehaviorSubject<InvoiceDto[]>([]);
  private destroy$ = new Subject<void>();
  
  // Customer and invoice info
  customerId: number | null = null;
  customerName: string = '';
  workflowId: number | null = null;
  invoiceId: number | null = null;
  selectedInvoiceId: number | null = null;
  invoiceNumber: string = '';
  invoiceDate: Date = new Date();
  totalInvoiceAmount: number = 0;
  
  // Product category selection
  selectedCategory: ProductCategory = 'Awnings';
  productCategories: ProductCategory[] = ['Renson', 'Awnings', 'Stock Items'];
  
  // Payment templates
  paymentTemplates: PaymentTemplate[] = [
    {
      category: 'Renson',
      splits: [
        { description: '25% Deposit', percentage: 25, daysFromInvoice: 0 },
        { description: '50% Prior to Completion', percentage: 50, daysFromInvoice: 30 },
        { description: '25% Upon Completion', percentage: 25, daysFromInvoice: 60 }
      ]
    },
    {
      category: 'Awnings',
      splits: [
        { description: '50% Deposit', percentage: 50, daysFromInvoice: 0 },
        { description: '50% Upon Completion', percentage: 50, daysFromInvoice: 45 }
      ]
    },
    {
      category: 'Stock Items',
      splits: [
        { description: '100% Payment Upfront', percentage: 100, daysFromInvoice: 0 }
      ]
    }
  ];
  
  // Recording payment
  selectedPaymentIndex: number | null = null;
  selectedPaymentScheduleId: number | null = null;
  paymentAmount: number = 0;
  paymentDate: string = new Date().toISOString().split('T')[0];
  paymentReference: string = '';
  showPaymentModal: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invoiceService: InvoiceService,
    private paymentScheduleService: PaymentScheduleService
  ) {}

  ngOnInit() {
    this.setupObservables();
    this.initializeComponent();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables() {
    this.paymentSchedule$ = this.scheduleSubject$.asObservable();
    this.invoices$ = this.invoicesSubject$.asObservable();
  }

  private initializeComponent() {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? +params['customerId'] : null;
        this.customerName = params['customerName'] || '';
        this.workflowId = params['workflowId'] ? +params['workflowId'] : null;
        this.invoiceId = params['invoiceId'] ? +params['invoiceId'] : null;
        this.invoiceNumber = params['invoiceNumber'] || '';
        this.totalInvoiceAmount = params['totalAmount'] ? +params['totalAmount'] : 0;
        
        if (params['invoiceDate']) {
          this.invoiceDate = new Date(params['invoiceDate']);
        }

        if (!this.customerId) {
          this.errorMessage$.next('No customer selected. Please select a customer first.');
          return;
        }

        this.loadInvoicesForCustomer();

        if (this.invoiceId) {
          this.selectedInvoiceId = this.invoiceId;
          this.loadExistingPaymentSchedule();
        }
      });
  }

  private loadInvoicesForCustomer() {
    if (!this.customerId) return;

    this.isLoading$.next(true);
    this.invoiceService.getInvoicesByCustomerId(this.customerId)
      .pipe(
        takeUntil(this.destroy$),
        tap(invoices => {
          this.invoicesSubject$.next(invoices);
          
          if (invoices.length === 1 && !this.selectedInvoiceId) {
            this.selectedInvoiceId = invoices[0].id;
            this.onInvoiceChange();
          }
        }),
        catchError(error => {
          console.error('Error loading invoices:', error);
          this.errorMessage$.next('Failed to load invoices for this customer');
          return of([]);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  onInvoiceChange() {
    if (!this.selectedInvoiceId) {
      this.clearInvoiceDetails();
      return;
    }

    this.isLoading$.next(true);
    this.invoiceService.getInvoiceById(this.selectedInvoiceId)
      .pipe(
        takeUntil(this.destroy$),
        tap(invoice => {
          this.loadInvoiceDetails(invoice);
          this.loadExistingPaymentSchedule();
        }),
        catchError(error => {
          console.error('Error loading invoice details:', error);
          this.errorMessage$.next('Failed to load invoice details');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  private loadInvoiceDetails(invoice: InvoiceDto) {
    this.invoiceId = invoice.id;
    this.invoiceNumber = invoice.invoiceNumber;
    this.invoiceDate = invoice.invoiceDate instanceof Date ? 
                       invoice.invoiceDate : 
                       new Date(invoice.invoiceDate);
    this.totalInvoiceAmount = invoice.totalAmount;
    this.workflowId = invoice.workflowId;
  }

  private clearInvoiceDetails() {
    this.invoiceId = null;
    this.invoiceNumber = '';
    this.invoiceDate = new Date();
    this.totalInvoiceAmount = 0;
    this.scheduleSubject$.next([]);
  }

  onCategoryChange() {
    if (this.selectedInvoiceId) {
      // Don't auto-generate, let user click the button
    }
  }

  generatePaymentSchedule() {
    if (this.totalInvoiceAmount <= 0 || !this.invoiceId) {
      this.errorMessage$.next('Please select an invoice first with a valid amount.');
      return;
    }

    const template = this.paymentTemplates.find(t => t.category === this.selectedCategory);
    if (!template) return;

    const scheduleItems: CreatePaymentScheduleItemDto[] = template.splits.map((split, index) => {
      const amount = (this.totalInvoiceAmount * split.percentage) / 100;
      const dueDate = new Date(this.invoiceDate);
      dueDate.setDate(dueDate.getDate() + split.daysFromInvoice);

      return {
        description: split.description,
        percentage: split.percentage,
        amount: amount,
        dueDate: dueDate,
        reference: this.generateReference(index + 1)
      };
    });

    const createDto: CreatePaymentScheduleDto = {
      invoiceId: this.invoiceId,
      productCategory: this.selectedCategory,
      scheduleItems: scheduleItems
    };

    this.isLoading$.next(true);
    this.paymentScheduleService.createPaymentSchedule(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(schedules => {
          this.scheduleSubject$.next(schedules);
          this.successMessage$.next('Payment schedule generated successfully');
          setTimeout(() => this.successMessage$.next(''), 3000);
        }),
        catchError(error => {
          console.error('Error creating payment schedule:', error);
          this.errorMessage$.next('Failed to create payment schedule');
          return of([]);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  private generateReference(sequenceNumber: number): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `PAY-${year}${month}-${String(sequenceNumber).padStart(3, '0')}`;
  }

  openPaymentModal(index: number) {
    const schedule = this.scheduleSubject$.value;
    const item = schedule[index];
    
    this.selectedPaymentIndex = index;
    this.selectedPaymentScheduleId = item.id;
    this.paymentAmount = item.amountDue;
    this.paymentReference = item.reference;
    this.showPaymentModal = true;
  }

  closePaymentModal() {
    this.showPaymentModal = false;
    this.selectedPaymentIndex = null;
    this.selectedPaymentScheduleId = null;
    this.paymentAmount = 0;
    this.paymentReference = '';
  }

  recordPayment() {
    if (this.selectedPaymentScheduleId === null) return;

    const schedule = this.scheduleSubject$.value;
    const item = schedule[this.selectedPaymentIndex!];

    if (this.paymentAmount <= 0 || this.paymentAmount > item.amountDue) {
      this.errorMessage$.next('Invalid payment amount');
      return;
    }

    const paymentDto: RecordSchedulePaymentDto = {
      paymentDate: new Date(this.paymentDate),
      amount: this.paymentAmount,
      reference: this.paymentReference,
      notes: `Payment recorded for ${item.description}`
    };

    this.isLoading$.next(true);
    this.paymentScheduleService.recordPayment(this.selectedPaymentScheduleId, paymentDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          this.successMessage$.next(`Payment of €${this.paymentAmount.toFixed(2)} recorded successfully`);
          this.closePaymentModal();
          this.loadExistingPaymentSchedule();
          setTimeout(() => this.successMessage$.next(''), 3000);
        }),
        catchError(error => {
          console.error('Error recording payment:', error);
          this.errorMessage$.next('Failed to record payment');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  getStatusClass(status: string): string {
    const statusClasses: { [key: string]: string } = {
      'Pending': 'status-pending',
      'Paid': 'status-paid',
      'Overdue': 'status-overdue',
      'Partially Paid': 'status-partial'
    };
    return statusClasses[status] || 'status-pending';
  }

  getTotalAmount(): number {
    const schedule = this.scheduleSubject$.value;
    return schedule.reduce((sum, item) => sum + item.amount, 0);
  }

  getTotalPaid(): number {
    const schedule = this.scheduleSubject$.value;
    return schedule.reduce((sum, item) => sum + item.amountPaid, 0);
  }

  getTotalDue(): number {
    return this.getTotalAmount() - this.getTotalPaid();
  }

  savePaymentSchedule() {
    const schedule = this.scheduleSubject$.value;
    
    if (schedule.length === 0) {
      this.errorMessage$.next('Please generate a payment schedule first');
      return;
    }

    // Schedule is already saved when generated
    this.successMessage$.next('Payment schedule is already saved');
    setTimeout(() => this.successMessage$.next(''), 3000);
  }

  private loadExistingPaymentSchedule() {
    if (!this.invoiceId) return;
    
    this.isLoading$.next(true);
    this.paymentScheduleService.getPaymentScheduleByInvoiceId(this.invoiceId)
      .pipe(
        takeUntil(this.destroy$),
        tap(schedules => {
          this.scheduleSubject$.next(schedules);
        }),
        catchError(error => {
          console.error('Error loading payment schedule:', error);
          return of([]);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  exportToXero() {
    const schedule = this.scheduleSubject$.value;
    
    if (schedule.length === 0 || !this.invoiceId) {
      this.errorMessage$.next('No payment schedule to export');
      return;
    }

    this.isLoading$.next(true);
    this.paymentScheduleService.exportToXero(this.invoiceId)
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          this.successMessage$.next('Payment schedule exported to Xero successfully');
          setTimeout(() => this.successMessage$.next(''), 3000);
        }),
        catchError(error => {
          console.error('Error exporting to Xero:', error);
          this.errorMessage$.next(error.message || 'Failed to export to Xero');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
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