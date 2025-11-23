// dashboard.component.ts
import { AfterViewInit, Component, ElementRef, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration } from 'chart.js/auto';
import { BehaviorSubject, forkJoin, Observable, of, Subject } from 'rxjs';
import { takeUntil, tap, catchError, finalize } from 'rxjs/operators';
import { 
  DashboardService, 
  DashboardStats, 
  RecentOrder, 
  TopCustomer, 
  ActivityItem 
} from '../../service/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('salesChart') salesChartRef!: ElementRef<HTMLCanvasElement>;
  
  private destroy$ = new Subject<void>();
  private salesChart!: Chart;
  
  // Observables for data
  stats$!: Observable<DashboardStats>;
  recentOrders$!: Observable<RecentOrder[]>;
  topCustomers$!: Observable<TopCustomer[]>;
  recentActivity$!: Observable<ActivityItem[]>;
  statusDistribution$!: Observable<{ status: string; count: number; percentage: number }[]>;
  
  // State management with BehaviorSubjects
  private statsSubject$ = new BehaviorSubject<DashboardStats>({
    ordersToDate: { value: 0, change: '0%', positive: true },
    ordersInProgress: { value: 0, change: '0%', positive: true },
    ordersNearCompletion: { value: 0, change: '0%', positive: true },
    totalRevenue: { value: 0, change: '0%', positive: true }
  });
  
  private recentOrdersSubject$ = new BehaviorSubject<RecentOrder[]>([]);
  private topCustomersSubject$ = new BehaviorSubject<TopCustomer[]>([]);
  private recentActivitySubject$ = new BehaviorSubject<ActivityItem[]>([]);
  private statusDistributionSubject$ = new BehaviorSubject<{ status: string; count: number; percentage: number }[]>([]);
  
  isLoading$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  
  activeTab: 'today' | 'month' | 'year' = 'today';

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
   // this.initializeObservables();
   // this.loadDashboardData();
  }

  ngAfterViewInit(): void {
    this.initChart();
    this.loadChartData(this.activeTab);
    // Small delay to ensure canvas is ready
    setTimeout(() => {
      //this.initChart();
      //this.loadChartData(this.activeTab);
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.salesChart) {
      this.salesChart.destroy();
    }
  }

  private initializeObservables(): void {
    this.stats$ = this.statsSubject$.asObservable();
    this.recentOrders$ = this.recentOrdersSubject$.asObservable();
    this.topCustomers$ = this.topCustomersSubject$.asObservable();
    this.recentActivity$ = this.recentActivitySubject$.asObservable();
    this.statusDistribution$ = this.statusDistributionSubject$.asObservable();
  }

  private readonly EMPTY_STATS: DashboardStats = {
  ordersToDate: { value: 0, change: '0%', positive: true },
  ordersInProgress: { value: 0, change: '0%', positive: true },
  ordersNearCompletion: { value: 0, change: '0%', positive: true },
  totalRevenue: { value: 0, change: '0%', positive: true }
};

 loadDashboardData(): void {
  this.isLoading$.next(true);
  this.errorMessage$.next('');

  forkJoin({
  stats: this.dashboardService.getDashboardStats()
    .pipe(catchError(() => of(this.EMPTY_STATS))),

  orders: this.dashboardService.getRecentOrders(5)
    .pipe(catchError(() => of([]))),

  customers: this.dashboardService.getTopCustomers(5)
    .pipe(catchError(() => of([]))),

  activity: [], //this.dashboardService.getRecentActivity(10)
    //.pipe(catchError(() => of([]))),

  distribution: this.dashboardService.getStatusDistribution()
    .pipe(catchError(() => of([])))
})
  .pipe(
    takeUntil(this.destroy$),
    tap(result => {
      this.statsSubject$.next(result.stats);
      this.recentOrdersSubject$.next(result.orders);
      this.topCustomersSubject$.next(result.customers);
      this.recentActivitySubject$.next(result.activity);
      this.statusDistributionSubject$.next(result.distribution);
    }),
    finalize(() => this.isLoading$.next(false))
  )
  .subscribe();
}

  private initChart(): void {
    if (!this.salesChartRef) {
      console.warn('Chart canvas not ready');
      return;
    }

    const ctx = this.salesChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Sales',
          data: [],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#3b82f6',
          pointHoverBorderColor: 'white',
          pointHoverBorderWidth: 2,
          borderWidth: 2
        }]
      },
      options: {
        
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'white',
            titleColor: '#1f2937',
            bodyColor: '#1f2937',
            borderColor: '#e5e7eb',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              label: context => '€' + context.parsed.y
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: '#f3f4f6'
            },
            ticks: {
              color: '#9ca3af',
              callback: value => '€' + (Number(value) / 1000) + 'k'
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#9ca3af' }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    };

    this.salesChart = new Chart(ctx, config);
  }

  loadChartData(period: 'today' | 'month' | 'year'): void {
    if (!this.salesChart) return;

    this.dashboardService.getChartData(period)
      .pipe(
        takeUntil(this.destroy$),
        tap(chartData => {
          this.salesChart.data.labels = chartData.labels;
          this.salesChart.data.datasets[0].data = chartData.data;
          this.salesChart.update();
        }),
        catchError(error => {
          console.error('Error loading chart data:', error);
          return [];
        })
      )
      .subscribe();
  }

  switchTab(period: 'today' | 'month' | 'year'): void {
    this.activeTab = period;
    this.loadChartData(period);
  }

  retryLoad(): void {
    this.errorMessage$.next('');
    this.loadDashboardData();
    if (this.salesChart) {
      this.loadChartData(this.activeTab);
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

  getActivityIcon(type: string): string {
    const iconMap: { [key: string]: string } = {
      'order': 'package',
      'invoice': 'file-text',
      'customer': 'users'
    };
    return iconMap[type] || 'circle';
  }

  trackByOrderId(index: number, order: RecentOrder): number {
    return order.id;
  }

  trackByCustomerId(index: number, customer: TopCustomer): number {
    return customer.id;
  }

  trackByActivityId(index: number, activity: ActivityItem): number {
    return activity.id;
  }

  trackByStatus(index: number, item: { status: string }): string {
    return item.status;
  }
}