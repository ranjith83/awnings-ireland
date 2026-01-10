import { TestBed } from '@angular/core/testing';
import { OutlookCalenderService } from './outlook-calendar.service';



describe('OutlookCalenderService', () => {
  let service: OutlookCalenderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OutlookCalenderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
