import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Workflow } from '../model/workflow.model';
import { environment } from '../app/environments/environment';

export interface WorkflowDto {
  workflowId: number;
  workflowName: string;
  productName: string;
  description: string;
  initialEnquiry: boolean;
  createQuotation: boolean;
  inviteShowRoomVisit: boolean;
  setupSiteVisit: boolean;
  invoiceSent: boolean;
  dateAdded: string | Date;
  addedBy: string;
  customerId: number;
  supplierId: number;
  productId: number;
  productTypeId: number;
  taskId?: number;
}

export interface CreateWorkflowDto {
  description: string;
  initialEnquiry: boolean;
  createQuotation: boolean;
  inviteShowRoomVisit: boolean;
  setupSiteVisit: boolean;
  invoiceSent: boolean;
  companyId: number;
  supplierId: number;
  productId: number;
  productTypeId: number;
  taskId?: number;
}

/**
 * Mirrors the C# InitialEnquiryDto exactly.
 * enquiryId, dateCreated and createdBy are returned by GET and
 * should be sent back on PUT (update); they are ignored on POST (add).
 */
export interface InitialEnquiryDto {
  enquiryId?: number;
  workflowId: number;
  comments: string;
  email: string;
  images?: string;

  // ── Email linkage (populated when created by the email processor) ──
  /** EmailTask.TaskId that originated this enquiry (null for manual entries). */
  taskId?: number | null;
  /** IncomingEmail.Id that originated this enquiry (null for manual entries). */
  incomingEmailId?: number | null;

  // ── Read-only audit fields (returned by GET, ignored by POST/PUT) ──
  dateCreated?: Date | string | null;
  createdBy?: string | null;
}

// Product addon interfaces
export interface BracketDto {
  bracketId: number;
  productId: number;
  bracketName: string;
  price: number;
}

export interface ArmDto {
  armId: number;
  productId: number;
  description: string;
  price: number;
}

export interface MotorDto {
  motorId: number;
  productId: number;
  description: string;
  price: number;
}

export interface HeaterDto {
  heaterId: number;
  productId: number;
  description: string;
  price: number;
}

export interface FixingPointDto {
  fixingPointId: number;
  description: string;
  price: number;
}

export interface SupplierDto {
  supplierId: number;
  supplierName: string;
}

export interface ProductTypeDto {
  productTypeId: number;
  description: string;
}

export interface ProductDto {
  productId: number;
  productName: string;
}

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private apiUrl = `${environment.apiUrl}/api/workflow`;
  private supplierApiUrl = `${environment.apiUrl}/api/suppliers`;

  constructor(private http: HttpClient) {}

  /** GET /api/workflow/GetAllWorfflowsForCustomer */
  getWorkflowsForCustomer(customerId: number): Observable<WorkflowDto[]> {
    const params = new HttpParams().set('CustomerId', customerId.toString());
    return this.http.get<WorkflowDto[]>(`${this.apiUrl}/GetAllWorfflowsForCustomer`, { params })
      .pipe(catchError(this.handleError));
  }

  /** POST /api/workflow/CreateWorkflow */
  createWorkflow(workflow: WorkflowDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/CreateWorkflow`, workflow)
      .pipe(catchError(this.handleError));
  }

  /** PUT /api/workflow/UpdateWorkflow */
  updateWorkflow(workflow: WorkflowDto): Observable<any> {
    return this.http.put(`${this.apiUrl}/UpdateWorkflow`, workflow)
      .pipe(catchError(this.handleError));
  }

  /** DELETE /api/workflow/DeleteWorkflow/{workflowId} */
  deleteWorkflow(workflowId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/DeleteWorkflow/${workflowId}`)
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GeInitialEnquiryForWorkflow */
  getInitialEnquiryForWorkflow(workflowId: number): Observable<InitialEnquiryDto[]> {
    const params = new HttpParams().set('WorkflowId', workflowId.toString());
    return this.http.get<InitialEnquiryDto[]>(`${this.apiUrl}/GeInitialEnquiryForWorkflow`, { params })
      .pipe(catchError(this.handleError));
  }

  /** POST /api/workflow/AddInitialEnquiry */
  addInitialEnquiry(enquiry: InitialEnquiryDto): Observable<InitialEnquiryDto> {
    return this.http.post<InitialEnquiryDto>(`${this.apiUrl}/AddInitialEnquiry`, enquiry)
      .pipe(catchError(this.handleError));
  }

  /** PUT /api/workflow/UpdateInitialEnquiry */
  updateInitialEnquiry(enquiry: InitialEnquiryDto): Observable<InitialEnquiryDto> {
    return this.http.put<InitialEnquiryDto>(`${this.apiUrl}/UpdateInitialEnquiry`, enquiry)
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GetStandardWidthsForProduct */
  getStandardWidthsForProduct(productId: number): Observable<number[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<number[]>(`${this.apiUrl}/GetStandardWidthsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GeArmsForProduct */
  getArmsForProduct(productId: number): Observable<ArmDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<ArmDto[]>(`${this.apiUrl}/GeArmsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GeMotorsForProduct */
  getMotorsForProduct(productId: number): Observable<MotorDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<MotorDto[]>(`${this.apiUrl}/GeMotorsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GeHeatersForProduct */
  getHeatersForProduct(productId: number): Observable<HeaterDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<HeaterDto[]>(`${this.apiUrl}/GeHeatersForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GetProjectionWidthsForProduct */
  getProjectionWidthsForProduct(productId: number): Observable<number[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<number[]>(`${this.apiUrl}/GetProjectionWidthsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GetProjectionPriceForProduct */
  getProjectionPriceForProduct(productId: number, widthCm: number, projectionCm: number): Observable<number> {
    const params = new HttpParams()
      .set('ProductId', productId.toString())
      .set('widthcm', widthCm.toString())
      .set('projectioncm', projectionCm.toString());
    return this.http.get<number>(`${this.apiUrl}/GetProjectionPriceForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GeBracketsForProduct */
  getBracketsForProduct(productId: number): Observable<BracketDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<BracketDto[]>(`${this.apiUrl}/GeBracketsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /** GET /api/workflow/GeFixingPointsForProduct */
  getFixingPointsForProduct(productId: number): Observable<FixingPointDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<FixingPointDto[]>(`${this.apiUrl}/GeFixingPointsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  // ============================================
  // SUPPLIER ENDPOINTS
  // ============================================

  getAllSuppliers(): Observable<SupplierDto[]> {
    return this.http.get<SupplierDto[]>(`${this.supplierApiUrl}/GetAllSuppliers`)
      .pipe(catchError(this.handleError));
  }

  getAllProductTypesForSupplier(supplierId: number): Observable<ProductTypeDto[]> {
    const params = new HttpParams().set('SupplierId', supplierId.toString());
    return this.http.get<ProductTypeDto[]>(`${this.supplierApiUrl}/GetAllProductTypesForSupplier`, { params })
      .pipe(catchError(this.handleError));
  }

  getAllProductsBySupplier(supplierId: number, productTypeId: number): Observable<ProductDto[]> {
    const params = new HttpParams()
      .set('SupplierId', supplierId.toString())
      .set('ProductTypeId', productTypeId.toString());
    return this.http.get<ProductDto[]>(`${this.supplierApiUrl}/GetAllProductsBySupplier`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * @deprecated – no backend endpoint for this. Retained for compatibility.
   * Prefer loading enquiries via getInitialEnquiryForWorkflow() and filtering by workflow.
   */
  getInitialEnquiryHistory(
    workflowId: number,
    page = 1,
    pageSize = 20
  ): Observable<{ items: any[]; totalCount: number; page: number; pageSize: number; totalPages: number }> {
    const params = new HttpParams()
      .set('workflowId', workflowId.toString())
      .set('page',       page.toString())
      .set('pageSize',   pageSize.toString());

    return this.http.get<any>(
      `${this.apiUrl}/EmailTask/audit`,
      { params }
    );
  }

  // ============================================
  // ERROR HANDLER
  // ============================================

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 0:   errorMessage = 'Unable to connect to server. Please check if the API is running.'; break;
        case 400: errorMessage = 'Bad Request: Please check your input data'; break;
        case 404: errorMessage = 'Not Found: The requested resource was not found'; break;
        case 500: errorMessage = 'Internal Server Error: Please try again later'; break;
        default:  errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }
    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}