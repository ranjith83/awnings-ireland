import { TestBed } from '@angular/core/testing';

import { InvoicePdfService } from './invoice-pdf.service';

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InvoicePdfService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
