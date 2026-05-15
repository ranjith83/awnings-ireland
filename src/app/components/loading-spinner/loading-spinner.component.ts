import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../../service/loading.service';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-bar-track" *ngIf="loadingService.loading$ | async">
      <div class="progress-bar-fill"></div>
    </div>
  `,
  styles: [`
    .progress-bar-track {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      z-index: 9999;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      width: 100%;
      background: #3b82f6;
      animation: indeterminate 1.4s ease-in-out infinite;
      transform-origin: left center;
    }

    @keyframes indeterminate {
      0%   { transform: scaleX(0) translateX(0%); }
      40%  { transform: scaleX(0.6) translateX(40%); }
      100% { transform: scaleX(0.1) translateX(1000%); }
    }
  `]
})
export class LoadingSpinnerComponent {
  constructor(public loadingService: LoadingService) {}
}