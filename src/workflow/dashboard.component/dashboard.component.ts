import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { Chart, ChartConfiguration } from 'chart.js/auto'

@Component({
  selector: 'app-dashboard.component',
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild('salesChart') salesChartRef!: ElementRef<HTMLCanvasElement>;
  salesChart!: Chart;
  activeTab: 'Today' | 'Month' | 'Year' = 'Today';

  ngAfterViewInit(): void {
   // this.initChart();
  }
/**
  private initChart(): void {
    const ctx = this.salesChartRef.nativeElement.getContext('2d');

    const hours = ['9Am', '10Am', '11Am', '12Pm', '1Pm', '2Pm', '3Pm', '4Pm', '5Pm', '6Pm', '7Pm'];
    const salesData = [5000, 10000, 8000, 15000, 12000, 18000, 16000, 22000, 19000, 25000, 23000];
  

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'Sales',
          data: salesData,
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
               
              label: context => '$' + context.parsed.y
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: '#f3f4f6',
             // drawBorder: false
            },
            ticks: {
              color: '#9ca3af',
              callback: value => '$' + (Number(value) / 1000) + 'k'
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

    this.salesChart = new Chart(ctx!, config);
  }

  switchTab(period: 'Today' | 'Month' | 'Year'): void {
    this.activeTab = period;

    let newLabels: string[] = [];
    let newData: number[] = [];

    if (period === 'Today') {
      newLabels = ['9Am', '10Am', '11Am', '12Pm', '1Pm', '2Pm', '3Pm', '4Pm', '5Pm', '6Pm', '7Pm'];
      newData = [5000, 10000, 8000, 15000, 12000, 18000, 16000, 22000, 19000, 25000, 23000];
    } else if (period === 'Month') {
      newLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      newData = [45000, 52000, 48000, 58000];
    } else {
      newLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      newData = [120000, 135000, 145000, 158000, 162000, 175000, 168000, 182000, 190000, 205000, 198000, 215000];
    }

    this.salesChart.data.labels = newLabels;
    this.salesChart.data.datasets[0].data = newData;
    this.salesChart.update();

}
     */
}
