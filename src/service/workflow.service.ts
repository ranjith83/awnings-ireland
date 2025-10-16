import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ProductModel, Supplier, Workflow } from '../model/workflow.model';


@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private apiUrl = 'https://your-api-domain.com/api/workflows';

  constructor(private http: HttpClient) {}

  getWorkflows(page: number = 1, pageSize: number = 10): Observable<any> {
    return this.http.get(`${this.apiUrl}/workflows?page=${page}&pageSize=${pageSize}`);
  }

  getSuppliers(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${this.apiUrl}/suppliers`);
  }

  getModelsBySupplier(supplierId: number): Observable<ProductModel[]> {
    return this.http.get<ProductModel[]>(`${this.apiUrl}/models?supplierId=${supplierId}`);
  }

  createWorkflow(workflow: Workflow): Observable<Workflow> {
    return this.http.post<Workflow>(`${this.apiUrl}/workflows`, workflow);
  }

  updateWorkflow(id: number, workflow: Partial<Workflow>): Observable<Workflow> {
    return this.http.put<Workflow>(`${this.apiUrl}/workflows/${id}`, workflow);
  }

  deleteWorkflow(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/workflows/${id}`);
  }

  updateWorkflowStage(id: number, stage: string, value: boolean): Observable<Workflow> {
    return this.http.patch<Workflow>(`${this.apiUrl}/workflows/${id}/stage`, { stage, value });
  }
}
