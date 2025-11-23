import { TestBed } from '@angular/core/testing';

import { AuditTrailService } from './audit-trail.service';

describe('AuditTrailService', () => {
  let service: AuditTrailService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuditTrailService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
