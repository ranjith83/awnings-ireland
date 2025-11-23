import { TestBed } from '@angular/core/testing';

import { SetupSiteVisitService } from './setup-site-visit.service';

describe('SetupSiteVisitService', () => {
  let service: SetupSiteVisitService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SetupSiteVisitService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
