import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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

  // Report types
  reportTypes: ReportType[] = [];
  selectedReport: string = 'customer';

  // Filters
  filters: ReportFilters = {
    dateRange: 'this-month',
    workflow: '',
    productModel: '',
    customerName: '',
    status: ''
  };

  // Data
  summaryStats: SummaryStats[] = [];
  statusDistribution: StatusDistribution[] = [];
  customerData: CustomerReportRow[] = [];
  invoiceData: InvoiceReportRow[] = [];
  recentActivity: any[] = [];

  // Pagination
  currentPage: number = 1;
  pageSize: number = 10;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Loading states
  isLoading: boolean = false;
  isExporting: boolean = false;
  errorMessage: string = '';

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
    this.loadReportTypes();
    this.loadReportData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadReportTypes(): void {
    this.reportsService.getReportTypes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (types) => {
          this.reportTypes = types;
        },
        error: (error) => {
          console.error('Error loading report types:', error);
        }
      });
  }

  loadReportData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Load summary statistics
    this.reportsService.getSummaryStats(this.filters, this.selectedReport)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.summaryStats = stats;
        },
        error: (error) => {
          this.errorMessage = 'Failed to load summary statistics. Please try again.';
          console.error('Error loading summary stats:', error);
        }
      });

    // Load status distribution for invoice reports
    if (this.selectedReport === 'invoice') {
      this.reportsService.getStatusDistribution(this.filters, this.selectedReport)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (distribution) => {
            this.statusDistribution = distribution;
          },
          error: (error) => {
            console.error('Error loading status distribution:', error);
          }
        });
    }

    // Load main report data
    this.loadMainReportData();

    // Load recent activity
    this.reportsService.getRecentActivity(5, this.selectedReport)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (activity) => {
          this.recentActivity = activity;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading recent activity:', error);
          this.isLoading = false;
        }
      });
  }

  loadMainReportData(): void {
    if (this.selectedReport === 'customer') {
      this.loadCustomerData();
    } else if (this.selectedReport === 'invoice') {
      this.loadInvoiceData();
    }
  }

  loadCustomerData(): void {
    this.reportsService.getCustomerReport(this.filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<CustomerReportRow>) => {
          this.customerData = response.data;
          this.totalRecords = response.total;
          this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
        },
        error: (error) => {
          this.errorMessage = 'Failed to load customer data. Please try again.';
          console.error('Error loading customer data:', error);
        }
      });
  }

  loadInvoiceData(): void {
    this.reportsService.getInvoiceReport(this.filters, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<InvoiceReportRow>) => {
          this.invoiceData = response.data;
          this.totalRecords = response.total;
          this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
        },
        error: (error) => {
          this.errorMessage = 'Failed to load invoice data. Please try again.';
          console.error('Error loading invoice data:', error);
        }
      });
  }

  selectReportType(reportId: string): void {
    this.selectedReport = reportId;
    this.currentPage = 1;
    this.filters.status = '';
    this.filters.customerName = '';
    this.loadReportData();
  }

  applyFilters(): void {
    this.currentPage = 1;
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
    this.currentPage = 1;
    this.loadReportData();
  }

  onDateRangeChange(): void {
    this.applyFilters();
  }

  onStatusChange(): void {
    this.applyFilters();
  }

  onCustomerNameChange(): void {
    // Debounce search in production
    this.applyFilters();
  }

  exportReport(format: 'csv' | 'pdf' | 'excel' = 'csv'): void {
    this.isExporting = true;

    this.reportsService.exportReport(this.selectedReport, this.filters, format)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const filename = `${this.selectedReport}-report-${new Date().toISOString().split('T')[0]}.${format}`;
          this.reportsService.downloadFile(blob, filename);
          this.isExporting = false;
        },
        error: (error) => {
          this.errorMessage = 'Failed to export report. Please try again.';
          console.error('Error exporting report:', error);
          this.isExporting = false;
        }
      });
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadMainReportData();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
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
    this.errorMessage = '';
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

  getPaginationText(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start} to ${end} of ${this.totalRecords} results`;
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