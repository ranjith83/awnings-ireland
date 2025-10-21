import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface WorkflowStages {
  initialEnquiry: boolean;
  createQuote: boolean;
  inviteShowroom: boolean;
  setupSiteVisit: boolean;
  invoice: boolean;
}

export interface SelectedWorkflow {
  id: number;
  product: string;
  description: string;
  stages: WorkflowStages;
  customerId?: number;
  customerName?: string;
}

@Injectable({
  providedIn: 'root'
})

export class WorkflowStateService {
  private selectedWorkflowSubject = new BehaviorSubject<SelectedWorkflow | null>(null);
  public selectedWorkflow$: Observable<SelectedWorkflow | null> = this.selectedWorkflowSubject.asObservable();

  constructor() {}

  setSelectedWorkflow(workflow: SelectedWorkflow): void {
    this.selectedWorkflowSubject.next(workflow);
  }

  getSelectedWorkflow(): SelectedWorkflow | null {
    return this.selectedWorkflowSubject.value;
  }

  clearSelectedWorkflow(): void {
    this.selectedWorkflowSubject.next(null);
  }

  isStageEnabled(stage: keyof WorkflowStages): boolean {
    const workflow = this.selectedWorkflowSubject.value;
    if (!workflow) return false;
    return workflow.stages[stage];
  }

  getEnabledStages(): string[] {
    const workflow = this.selectedWorkflowSubject.value;
    if (!workflow) return [];
    
    const stages: string[] = [];
    if (workflow.stages.initialEnquiry) stages.push('initial-enquiry');
    if (workflow.stages.createQuote) stages.push('create-quote');
    if (workflow.stages.inviteShowroom) stages.push('invite-showroom');
    if (workflow.stages.setupSiteVisit) stages.push('setup-site-visit');
    if (workflow.stages.invoice) stages.push('invoice');
    
    return stages;
  }

  getNextEnabledStage(currentStage: string): string | null {
    const enabledStages = this.getEnabledStages();
    const currentIndex = enabledStages.indexOf(currentStage);
    
    if (currentIndex === -1 || currentIndex === enabledStages.length - 1) {
      return null;
    }
    
    return enabledStages[currentIndex + 1];
  }

  getPreviousEnabledStage(currentStage: string): string | null {
    const enabledStages = this.getEnabledStages();
    const currentIndex = enabledStages.indexOf(currentStage);
    
    if (currentIndex <= 0) {
      return null;
    }
    
    return enabledStages[currentIndex - 1];
  }
}