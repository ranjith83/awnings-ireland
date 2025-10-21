import { TestBed } from '@angular/core/testing';

import { WorkflowStateService } from './workflow-state.service';

describe('WorkflowStateService', () => {
  let service: WorkflowStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkflowStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
