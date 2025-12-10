import { TestBed } from '@angular/core/testing';

import { PaymentScheduleService } from './payment-schedule.service';

describe('PaymentScheduleService', () => {
  let service: PaymentScheduleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PaymentScheduleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
