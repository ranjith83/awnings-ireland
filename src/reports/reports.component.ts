import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, of } from 'rxjs';
import { takeUntil, tap, catchError, finalize, map } from 'rxjs/operators';

import {
  ReportsService,
  ReportType,
  SummaryStats,
  StatusDistribution,
  ReportFilters,
  PaginatedResponse,
  CustomerReportRow,
  InvoiceReportRow
} from '../service/reports.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Observables for data
  reportTypes$!: Observable<ReportType[]>;
  summaryStats$!: Observable<SummaryStats[]>;
  statusDistribution$!: Observable<StatusDistribution[]>;
  customerData$!: Observable<CustomerReportRow[]>;
  invoiceData$!: Observable<InvoiceReportRow[]>;
  recentActivity$!: Observable<any[]>;
  paginationText$!: Observable<string>;
  
  // State management with BehaviorSubjects
  isLoading$ = new BehaviorSubject<boolean>(false);
  isExporting$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  
  private reportTypesSubject$ = new BehaviorSubject<ReportType[]>([]);
  private summaryStatsSubject$ = new BehaviorSubject<SummaryStats[]>([]);
  private statusDistributionSubject$ = new BehaviorSubject<StatusDistribution[]>([]);
  private customerDataSubject$ = new BehaviorSubject<CustomerReportRow[]>([]);
  private invoiceDataSubject$ = new BehaviorSubject<InvoiceReportRow[]>([]);
  private recentActivitySubject$ = new BehaviorSubject<any[]>([]);
  
  // Pagination subjects
  currentPage$ = new BehaviorSubject<number>(1);
  pageSize$ = new BehaviorSubject<number>(10);
  totalRecords$ = new BehaviorSubject<number>(0);
  totalPages$ = new BehaviorSubject<number>(0);
  
  // Selected report type
  selectedReport: string = 'customer';
  
  // Filters
  filters: ReportFilters = {
    dateRange: 'this-month',
    workflow: '',
    productModel: '',
    customerName: '',
    status: ''
  };

  // Dropdown options
  invoiceStatuses = [
    { id: '', name: 'All Statuses' },
    { id: 'Draft', name: 'Draft' },
    { id: 'Sent', name: 'Sent' },
    { id: 'Paid', name: 'Paid' },
    { id: 'Partially Paid', name: 'Partially Paid' },
    { id: 'Overdue', name: 'Overdue' },
    { id: 'Cancelled', name: 'Cancelled' }
  ];

  dateRanges = [
    { id: 'today', name: 'Today' },
    { id: 'this-week', name: 'This Week' },
    { id: 'this-month', name: 'This Month' },
    { id: 'this-quarter', name: 'This Quarter' },
    { id: 'this-year', name: 'This Year' }
  ];

  constructor(private reportsService: ReportsService) {}

  ngOnInit(): void {
    this.initializeObservables();
    this.loadReportTypes();
    this.loadReportData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeObservables(): void {
    // Setup observables from subjects
    this.reportTypes$ = this.reportTypesSubject$.asObservable();
    this.summaryStats$ = this.summaryStatsSubject$.asObservable();
    this.statusDistribution$ = this.statusDistributionSubject$.asObservable();
    this.customerData$ = this.customerDataSubject$.asObservable();
    this.invoiceData$ = this.invoiceDataSubject$.asObservable();
    this.recentActivity$ = this.recentActivitySubject$.asObservable();
    
    // Setup pagination text observable
    this.paginationText$ = combineLatest([
      this.currentPage$,
      this.pageSize$,
      this.totalRecords$
    ]).pipe(
      map(([currentPage, pageSize, totalRecords]) => {
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalRecords);
        return `Showing ${start} to ${end} of ${totalRecords} results`;
      })
    );
  }

  loadReportTypes(): void {
    this.reportsService.getReportTypes()
      .pipe(
        takeUntil(this.destroy$),
        tap(types => this.reportTypesSubject$.next(types)),
        catchError(error => {
          console.error('Error loading report types:', error);
          return of([]);
        })
      )
      .subscribe();
  }

  loadReportData(): void {
    this.isLoading$.next(true);
    this.errorMessage$.next('');

    // Load summary statistics
    this.reportsService.getSummaryStats(this.filters, this.selectedReport)
      .pipe(
        takeUntil(this.destroy$),
        tap(stats => this.summaryStatsSubject$.next(stats)),
        catchError(error => {
          this.errorMessage$.next('Failed to load summary statistics. Please try again.');
          console.error('Error loading summary stats:', error);
          return of([]);
        })
      )
      .subscribe();

    // Load status distribution for invoice reports
    if (this.selectedReport === 'invoice') {
      this.reportsService.getStatusDistribution(this.filters, this.selectedReport)
        .pipe(
          takeUntil(this.destroy$),
          tap(distribution => this.statusDistributionSubject$.next(distribution)),
          catchError(error => {
            console.error('Error loading status distribution:', error);
            return of([]);
          })
        )
        .subscribe();
    } else {
      this.statusDistributionSubject$.next([]);
    }

    // Load main report data
    this.loadMainReportData();

    // Load recent activity
    this.reportsService.getRecentActivity(5, this.selectedReport)
      .pipe(
        takeUntil(this.destroy$),
        tap(activity => {
          this.recentActivitySubject$.next(activity);
          this.isLoading$.next(false);
        }),
        catchError(error => {
          console.error('Error loading recent activity:', error);
          this.isLoading$.next(false);
          return of([]);
        })
      )
      .subscribe();
  }

  loadMainReportData(): void {
    if (this.selectedReport === 'customer') {
      this.loadCustomerData();
    } else if (this.selectedReport === 'invoice') {
      this.loadInvoiceData();
    }
  }

  loadCustomerData(): void {
    const currentPage = this.currentPage$.value;
    const pageSize = this.pageSize$.value;
    
    this.reportsService.getCustomerReport(this.filters, currentPage, pageSize)
      .pipe(
        takeUntil(this.destroy$),
        tap((response: PaginatedResponse<CustomerReportRow>) => {
          this.customerDataSubject$.next(response.data);
          this.totalRecords$.next(response.total);
          this.totalPages$.next(Math.ceil(response.total / pageSize));
        }),
        catchError(error => {
          this.errorMessage$.next('Failed to load customer data. Please try again.');
          console.error('Error loading customer data:', error);
          return of({ data: [], total: 0, page: 1, pageSize: pageSize } as PaginatedResponse<CustomerReportRow>);
        })
      )
      .subscribe();
  }

  loadInvoiceData(): void {
    const currentPage = this.currentPage$.value;
    const pageSize = this.pageSize$.value;
    
    this.reportsService.getInvoiceReport(this.filters, currentPage, pageSize)
      .pipe(
        takeUntil(this.destroy$),
        tap((response: PaginatedResponse<InvoiceReportRow>) => {
          this.invoiceDataSubject$.next(response.data);
          this.totalRecords$.next(response.total);
          this.totalPages$.next(Math.ceil(response.total / pageSize));
        }),
        catchError(error => {
          this.errorMessage$.next('Failed to load invoice data. Please try again.');
          console.error('Error loading invoice data:', error);
          return of({ data: [], total: 0, page: 1, pageSize: pageSize } as PaginatedResponse<InvoiceReportRow>);
        })
      )
      .subscribe();
  }

  selectReportType(reportId: string): void {
    this.selectedReport = reportId;
    this.currentPage$.next(1);
    this.filters.status = '';
    this.filters.customerName = '';
    this.loadReportData();
  }

  applyFilters(): void {
    this.currentPage$.next(1);
    this.loadReportData();
  }

  clearFilters(): void {
    this.filters = {
      dateRange: 'this-month',
      workflow: '',
      productModel: '',
      customerName: '',
      status: ''
    };
    this.currentPage$.next(1);
    this.loadReportData();
  }

  onDateRangeChange(): void {
    this.applyFilters();
  }

  onStatusChange(): void {
    this.applyFilters();
  }

  onCustomerNameChange(): void {
    this.applyFilters();
  }

  exportReport(format: 'csv' | 'pdf' | 'excel' = 'csv'): void {
    this.isExporting$.next(true);

    this.reportsService.exportReport(this.selectedReport, this.filters, format)
      .pipe(
        takeUntil(this.destroy$),
        tap(blob => {
          const filename = `${this.selectedReport}-report-${new Date().toISOString().split('T')[0]}.${format}`;
          this.reportsService.downloadFile(blob, filename);
        }),
        catchError(error => {
          this.errorMessage$.next('Failed to export report. Please try again.');
          console.error('Error exporting report:', error);
          return of(new Blob());
        }),
        finalize(() => this.isExporting$.next(false))
      )
      .subscribe();
  }

  previousPage(): void {
    const currentPage = this.currentPage$.value;
    if (currentPage > 1) {
      this.currentPage$.next(currentPage - 1);
      this.loadMainReportData();
    }
  }

  nextPage(): void {
    const currentPage = this.currentPage$.value;
    const totalPages = this.totalPages$.value;
    if (currentPage < totalPages) {
      this.currentPage$.next(currentPage + 1);
      this.loadMainReportData();
    }
  }

  getStatusBadgeClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'Draft': 'badge-warning',
      'Sent': 'badge-info',
      'Paid': 'badge-success',
      'Partially Paid': 'badge-primary',
      'Overdue': 'badge-danger',
      'Cancelled': 'badge-secondary'
    };
    return statusMap[status] || 'badge-default';
  }

  retryLoad(): void {
    this.errorMessage$.next('');
    this.loadReportData();
  }

  trackByReportId(index: number, report: ReportType): string {
    return report.id;
  }

  trackByCustomerId(index: number, customer: CustomerReportRow): number {
    return customer.id;
  }

  trackByInvoiceId(index: number, invoice: InvoiceReportRow): number {
    return invoice.id;
  }

  trackByStatusName(index: number, status: StatusDistribution): string {
    return status.status;
  }

  getIconClass(iconName: string): string {
    const iconMap: { [key: string]: string } = {
      'bar-chart': 'lucide-bar-chart-3',
      'users': 'lucide-users',
      'file-text': 'lucide-file-text',
      'package': 'lucide-package'
    };
    return iconMap[iconName] || 'lucide-file-text';
  }
}