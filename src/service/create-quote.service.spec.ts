import { TestBed } from '@angular/core/testing';

import { CreateQuoteService } from './create-quote.service';

describe('CreateQuoteService', () => {
  let service: CreateQuoteService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CreateQuoteService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
