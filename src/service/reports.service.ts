// reports.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';
import { CustomerService, CustomerMainViewDto } from './customer-service';
import { InvoiceService, InvoiceDto } from './invoice.service';

export interface ReportType {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface SummaryStats {
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

export interface StatusDistribution {
  status: string;
  count: number;
  percentage: number;
}

export interface ReportFilters {
  dateRange: string;
  workflow?: string;
  productModel?: string;
  customerName?: string;
  status?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerReportRow {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  mobile: string;
  siteAddress: string;
  totalInvoices: number;
  totalRevenue: number;
  outstandingAmount: number;
}

export interface InvoiceReportRow {
  id: number;
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  daysOverdue: number;
}

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private apiUrl = `${environment.apiUrl}/api/reports`;

  constructor(
    private http: HttpClient,
    private customerService: CustomerService,
    private invoiceService: InvoiceService
  ) {}

  getReportTypes(): Observable<ReportType[]> {
    return of([
      { id: 'customer', name: 'Customer Report', icon: 'users', color: 'blue' },
      { id: 'invoice', name: 'Invoice Report', icon: 'file-text', color: 'green' },
      { id: 'workflow', name: 'Workflow Report', icon: 'bar-chart', color: 'purple' }
    ]);
  }

  getSummaryStats(filters: ReportFilters, reportType: string): Observable<SummaryStats[]> {
    if (reportType === 'customer') {
      return this.getCustomerSummaryStats();
    } else if (reportType === 'invoice') {
      return this.getInvoiceSummaryStats();
    }
    return of([]);
  }

  private getCustomerSummaryStats(): Observable<SummaryStats[]> {
    return forkJoin({
      customers: this.customerService.getAllCustomers(),
      invoices: this.invoiceService.getAllInvoices()
    }).pipe(
      map(({ customers, invoices }) => {
        const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        const avgRevenue = customers.length > 0 ? totalRevenue / customers.length : 0;
        const activeCustomers = Math.floor(customers.length * 0.75);

        return [
          {
            label: 'Total Customers',
            value: customers.length.toString(),
            change: '+12%',
            positive: true
          },
          {
            label: 'Active Customers',
            value: activeCustomers.toString(),
            change: '+8%',
            positive: true
          },
          {
            label: 'Total Revenue',
            value: `€${totalRevenue.toFixed(2)}`,
            change: '+15%',
            positive: true
          },
          {
            label: 'Avg Revenue/Customer',
            value: `€${avgRevenue.toFixed(2)}`,
            change: '+5%',
            positive: true
          }
        ];
      }),
      catchError(() => of([]))
    );
  }

  private getInvoiceSummaryStats(): Observable<SummaryStats[]> {
    return this.invoiceService.getAllInvoices().pipe(
      map(invoices => {
        const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        const paidAmount = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
        const outstanding = invoices.reduce((sum, inv) => sum + (inv.amountDue || inv.totalAmount), 0);
        const paidCount = invoices.filter(inv => inv.status === 'Paid').length;
        const overdueCount = invoices.filter(inv => inv.status === 'Overdue').length;

        return [
          {
            label: 'Total Invoices',
            value: invoices.length.toString(),
            change: '+10%',
            positive: true
          },
          {
            label: 'Total Revenue',
            value: `€${totalAmount.toFixed(2)}`,
            change: '+18%',
            positive: true
          },
          {
            label: 'Outstanding',
            value: `€${outstanding.toFixed(2)}`,
            change: '-5%',
            positive: true
          },
          {
            label: 'Overdue Invoices',
            value: overdueCount.toString(),
            change: '-12%',
            positive: false
          }
        ];
      }),
      catchError(() => of([]))
    );
  }

  getStatusDistribution(filters: ReportFilters, reportType: string): Observable<StatusDistribution[]> {
    if (reportType === 'invoice') {
      return this.getInvoiceStatusDistribution();
    }
    return of([]);
  }

  private getInvoiceStatusDistribution(): Observable<StatusDistribution[]> {
    return this.invoiceService.getAllInvoices().pipe(
      map(invoices => {
        const statusCounts = invoices.reduce((acc, inv) => {
          acc[inv.status] = (acc[inv.status] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number });

        const total = invoices.length;
        return Object.entries(statusCounts).map(([status, count]) => ({
          status,
          count,
          percentage: (count / total) * 100
        }));
      }),
      catchError(() => of([]))
    );
  }

  getCustomerReport(filters: ReportFilters, page: number, pageSize: number): Observable<PaginatedResponse<CustomerReportRow>> {
    return forkJoin({
      customers: this.customerService.getAllCustomers(),
      invoices: this.invoiceService.getAllInvoices()
    }).pipe(
      map(({ customers, invoices }) => {
        const customerData = customers.map(customer => {
          const customerInvoices = invoices.filter(inv => inv.customerId === customer.companyId);
          const totalRevenue = customerInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
          const outstandingAmount = customerInvoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0);

          return {
            id: customer.companyId,
            companyName: customer.companyName,
            contactName: customer.contactName,
            email: customer.contactEmail,
            mobile: customer.mobilePhone,
            siteAddress: customer.siteAddress,
            totalInvoices: customerInvoices.length,
            totalRevenue,
            outstandingAmount
          };
        });

        // Apply filters
        let filteredData = customerData;
        if (filters.customerName) {
          filteredData = filteredData.filter(c => 
            c.companyName.toLowerCase().includes(filters.customerName!.toLowerCase())
          );
        }

        // Pagination
        const start = (page - 1) * pageSize;
        const paginatedData = filteredData.slice(start, start + pageSize);

        return {
          data: paginatedData,
          total: filteredData.length,
          page,
          pageSize
        };
      }),
      catchError(() => of({ data: [], total: 0, page, pageSize }))
    );
  }

  getInvoiceReport(filters: ReportFilters, page: number, pageSize: number): Observable<PaginatedResponse<InvoiceReportRow>> {
    return this.invoiceService.getAllInvoices().pipe(
      map(invoices => {
        const invoiceData = invoices.map(invoice => {
          const invoiceDate = new Date(invoice.invoiceDate);
          const dueDate = new Date(invoice.dueDate);
          const today = new Date();
          const daysOverdue = invoice.status === 'Overdue' 
            ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          return {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customerName,
            invoiceDate: invoiceDate.toLocaleDateString('en-GB'),
            dueDate: dueDate.toLocaleDateString('en-GB'),
            totalAmount: invoice.totalAmount,
            amountPaid: invoice.amountPaid || 0,
            amountDue: invoice.amountDue || invoice.totalAmount,
            status: invoice.status,
            daysOverdue
          };
        });

        // Apply filters
        let filteredData = invoiceData;
        if (filters.status) {
          filteredData = filteredData.filter(inv => inv.status === filters.status);
        }
        if (filters.customerName) {
          filteredData = filteredData.filter(inv => 
            inv.customerName.toLowerCase().includes(filters.customerName!.toLowerCase())
          );
        }

        // Pagination
        const start = (page - 1) * pageSize;
        const paginatedData = filteredData.slice(start, start + pageSize);

        return {
          data: paginatedData,
          total: filteredData.length,
          page,
          pageSize
        };
      }),
      catchError(() => of({ data: [], total: 0, page, pageSize }))
    );
  }

  getRecentActivity(limit: number, reportType: string): Observable<any[]> {
    if (reportType === 'invoice') {
      return this.invoiceService.getAllInvoices().pipe(
        map(invoices => {
          return invoices
            .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
            .slice(0, limit)
            .map(inv => ({
              id: inv.id,
              customer: inv.customerName,
              workflow: `Invoice ${inv.invoiceNumber}`,
              product: `${inv.invoiceItems?.length || 0} items`,
              status: inv.status,
              date: new Date(inv.invoiceDate).toLocaleDateString('en-GB'),
              value: `€${inv.totalAmount.toFixed(2)}`
            }));
        }),
        catchError(() => of([]))
      );
    }
    return of([]);
  }

  exportReport(reportType: string, filters: ReportFilters, format: string): Observable<Blob> {
    // Mock export - in real implementation, call backend API
    return new Observable(observer => {
      setTimeout(() => {
        const blob = new Blob(['Report data'], { type: 'text/csv' });
        observer.next(blob);
        observer.complete();
      }, 1000);
    });
  }

  downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}