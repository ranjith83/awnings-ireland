import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface WorkflowStages {
  initialEnquiry: boolean;
  createQuote: boolean;
  inviteShowroom: boolean;
  setupSiteVisit: boolean;
  finalQuote: boolean;
  invoice: boolean;
}

export interface SelectedWorkflow {
  id: number;
  product: string;
  productId: number;
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

  private stepCompletedSubject = new Subject<string>();
  /** Emits the step path (e.g. 'initial-enquiry') after a successful first save. */
  public stepCompleted$ = this.stepCompletedSubject.asObservable();

  private workflowChangedSubject = new Subject<void>();
  /** Emits after any record deletion so the workflow status can be reloaded. */
  public workflowChanged$ = this.workflowChangedSubject.asObservable();

  constructor() {}

  /** Call from a step component after its first successful save. */
  notifyStepCompleted(stepPath: string): void {
    this.stepCompletedSubject.next(stepPath);
  }

  /** Call from a step component after a record is deleted. */
  notifyWorkflowChanged(): void {
    this.workflowChangedSubject.next();
  }

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
    if (workflow.stages.finalQuote) stages.push('final-quote');
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