// dashboard.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError, take } from 'rxjs/operators';
import { environment } from '../app/environments/environment';
import { InvoiceService } from './invoice.service';
import { CustomerService } from './customer-service';

// ---------- Interfaces ----------
export interface DashboardStats {
  ordersToDate: { value: number; change: string; positive: boolean };
  ordersInProgress: { value: number; change: string; positive: boolean };
  ordersNearCompletion: { value: number; change: string; positive: boolean };
  totalRevenue: { value: number; change: string; positive: boolean };
}

export interface ChartData {
  labels: string[];
  data: number[];
}

export interface RecentOrder {
  id: number;
  customerName: string;
  orderNumber: string;
  status: string;
  amount: number;
  date: string;
}

export interface TopCustomer {
  id: number;
  name: string;
  orders: number;
  revenue: number;
}

export interface ActivityItem {
  id: number;
  type: 'order' | 'invoice' | 'customer';
  title: string;
  description: string;
  time: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  private apiUrl = `${environment.apiUrl}/api/dashboard`;

  constructor(
    private invoiceService: InvoiceService,
    private customerService: CustomerService
  ) {}

  // -------------------------------------------------------
  // 🔥 FIX: Every getAll* method MUST complete → use take(1)
  // -------------------------------------------------------

  getDashboardStats(): Observable<DashboardStats> {
    return forkJoin({
      invoices: this.invoiceService.getAllInvoices().pipe(take(1)),
      customers: this.customerService.getAllCustomers().pipe(take(1))
    }).pipe(
      map(({ invoices, customers }) => {
        const totalOrders = invoices.length;
        const inProgressOrders = invoices.filter(inv =>
          ['Draft', 'Sent'].includes(inv.status)
        ).length;

        const nearCompletionOrders = invoices.filter(inv =>
          inv.status === 'Partially Paid'
        ).length;

        const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);

        return {
          ordersToDate: { value: totalOrders, change: '+3.5%', positive: true },
          ordersInProgress: { value: inProgressOrders, change: '+5%', positive: true },
          ordersNearCompletion: { value: nearCompletionOrders, change: '-3%', positive: false },
          totalRevenue: { value: totalRevenue, change: '+12%', positive: true }
        };
      }),
      catchError(() =>
        of({
          ordersToDate: { value: 0, change: '0%', positive: true },
          ordersInProgress: { value: 0, change: '0%', positive: true },
          ordersNearCompletion: { value: 0, change: '0%', positive: true },
          totalRevenue: { value: 0, change: '0%', positive: true }
        })
      )
    );
  }

  // -------------------------------------------------------
  // CHART DATA
  // -------------------------------------------------------
  getChartData(period: 'today' | 'month' | 'year'): Observable<ChartData> {
    return this.invoiceService.getAllInvoices().pipe(
      take(1),
      map(invoices => {
        if (period === 'today') {
          const hours = ['9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM'];
          const data = hours.map(() => Math.floor(Math.random() * 20000) + 5000);
          return { labels: hours, data };
        }

        if (period === 'month') {
          const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
          const weeklyData = weeks.map(() => {
            const weekInvoices = invoices.slice(0, Math.floor(invoices.length / 4));
            return weekInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
          });
          return { labels: weeks, data: weeklyData };
        }

        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const monthlyData = months.map((_, index) => {
          const monthInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.invoiceDate);
            return invDate.getMonth() === index;
          });
          return monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        });
        return { labels: months, data: monthlyData };
      }),
      catchError(() => of({ labels: [], data: [] }))
    );
  }

  // -------------------------------------------------------
  // RECENT ORDERS
  // -------------------------------------------------------
  getRecentOrders(limit = 5): Observable<RecentOrder[]> {
    return this.invoiceService.getAllInvoices().pipe(
      take(1),
      map(invoices =>
        invoices
          .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
          .slice(0, limit)
          .map(inv => ({
            id: inv.id,
            customerName: inv.customerName,
            orderNumber: inv.invoiceNumber,
            status: inv.status,
            amount: inv.totalAmount,
            date: new Date(inv.invoiceDate).toLocaleDateString('en-GB')
          }))
      ),
      catchError(() => of([]))
    );
  }

  // -------------------------------------------------------
  // TOP CUSTOMERS
  // -------------------------------------------------------
  getTopCustomers(limit = 5): Observable<TopCustomer[]> {
    return forkJoin({
      customers: this.customerService.getAllCustomers().pipe(take(1)),
      invoices: this.invoiceService.getAllInvoices().pipe(take(1))
    }).pipe(
      map(({ customers, invoices }) => {
        const stats = customers.map(cust => {
          const custInvoices = invoices.filter(inv => inv.customerId === cust.customerId);
          return {
            id: cust.customerId,
            name: cust.companyName,
            orders: custInvoices.length,
            revenue: custInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0)
          };
        });

        return stats.sort((a, b) => b.revenue - a.revenue).slice(0, limit);
      }),
      catchError(() => of([]))
    );
  }

  // -------------------------------------------------------
  // RECENT ACTIVITY
  // -------------------------------------------------------
 

  // -------------------------------------------------------
  // STATUS DISTRIBUTION
  // -------------------------------------------------------
  getStatusDistribution(): Observable<{ status: string; count: number; percentage: number }[]> {
    return this.invoiceService.getAllInvoices().pipe(
      take(1),
      map(invoices => {
        const counts = invoices.reduce((acc, inv) => {
          acc[inv.status] = (acc[inv.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const total = invoices.length;
        return Object.entries(counts).map(([status, count]) => ({
          status,
          count,
          percentage: (count / total) * 100
        }));
      }),
      catchError(() => of([]))
    );
  }
}
