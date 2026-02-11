import { TestBed } from '@angular/core/testing';

import { EmailTaskService } from './email-task.service';

describe('EmailTaskService', () => {
  let service: EmailTaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EmailTaskService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
