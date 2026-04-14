import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Workflow } from '../model/workflow.model';
import { environment } from '../app/environments/environment';
import { map } from 'rxjs/operators';

export interface WorkflowDto {
  workflowId: number;
  workflowName: string;
  productName: string;
  description: string;

  // ── Stage enabled flags (user-controlled) ────────────────────────────────
  initialEnquiry: boolean;
  createQuotation: boolean;
  inviteShowRoomVisit: boolean;
  setupSiteVisit: boolean;
  invoiceSent: boolean;

  // ── Stage completed flags (server-computed) ───────────────────────────────
  initialEnquiryCompleted: boolean;
  createQuotationCompleted: boolean;
  inviteShowRoomCompleted: boolean;
  setupSiteVisitCompleted: boolean;
  invoiceSentCompleted: boolean;

  /**
   * True when any dependency record exists (enquiry, quote, showroom, site visit,
   * or invoice). The delete button is locked in the UI when this is true.
   */
  hasDependencies: boolean;

  dateAdded: string | Date;
  addedBy: string;
  customerId: number;
  supplierId: number;
  productId: number;
  productTypeId: number;
  companyId: number;
  taskId?: number;
}

/** One dependency type returned when a delete is blocked. */
export interface WorkflowDependency {
  name: string;
  count: number;
}

/** Returned by DELETE /api/workflow/DeleteWorkflow/{id}. */
export interface WorkflowDeleteResult {
  deleted: boolean;
  message: string;
  blockingDependencies: WorkflowDependency[];
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

  /**
   * Plain-text email signature appended to outgoing emails.
   * e.g. "Kindest regards,\nMichael Maguire\nAwnings of Ireland\n..."
   * Optional — null/undefined for enquiries where no signature was supplied.
   */
  signature?: string | null;

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
  bracketName: string;
  price: number;
  armTypeId: number | null;   // <-- ADD THIS
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

  /** DELETE /api/workflow/DeleteWorkflow/{workflowId}
   *  Returns WorkflowDeleteResult — check result.deleted to know if it succeeded.
   *  A 200 is returned even when blocked so the error handler is not triggered.
   */
  deleteWorkflow(workflowId: number): Observable<WorkflowDeleteResult> {
    return this.http.delete<WorkflowDeleteResult>(`${this.apiUrl}/DeleteWorkflow/${workflowId}`)
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
getBracketsForProduct(productId: number, armTypeId?: number | null): Observable<BracketDto[]> {
  let params: any = { ProductId: productId };
  if (armTypeId != null) params['armTypeId'] = armTypeId;
  return this.http.get<BracketDto[]>(`${this.apiUrl}/GeBracketsForProduct`, { params })
    .pipe(catchError(this.handleError));
}

  /** GET /api/workflow/GeFixingPointsForProduct */
  getFixingPointsForProduct(productId: number): Observable<FixingPointDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<FixingPointDto[]>(`${this.apiUrl}/GeFixingPointsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

getArmTypeForProjection(productId: number, widthcm: number, projectioncm: number): Observable<number | null> {
  return this.http.get<number | null>(
    `${this.apiUrl}/GetArmTypeForProjection`,
    { params: { ProductId: productId, widthcm, projectioncm } }
  ).pipe(catchError(this.handleError));
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

  

// ── Addon availability checks (drives show/hide of checkboxes) ────────────────
 
hasNonStandardRALColours(productId: number): Observable<boolean> {
  return this.http.get<boolean>(`${this.apiUrl}/HasNonStandardRALColours`, { params: { ProductId: productId } })
    .pipe(catchError(this.handleError));
}
 
hasShadePlus(productId: number): Observable<boolean> {
  return this.http.get<boolean>(`${this.apiUrl}/HasShadePlus`, { params: { ProductId: productId } })
    .pipe(catchError(this.handleError));
}
 
hasValanceStyles(productId: number): Observable<boolean> {
  return this.http.get<boolean>(`${this.apiUrl}/HasValanceStyles`, { params: { ProductId: productId } })
    .pipe(catchError(this.handleError));
}
 
hasWallSealingProfiles(productId: number): Observable<boolean> {
  return this.http.get<boolean>(`${this.apiUrl}/HasWallSealingProfiles`, { params: { ProductId: productId } })
    .pipe(catchError(this.handleError));
}
 
// ── Addon price lookups ───────────────────────────────────────────────────────
 
getNonStandardRALColourPrice(productId: number, widthcm: number): Observable<number> {
  return this.http.get<number>(`${this.apiUrl}/GeNonStandardRALColourPriceForProduct`, { params: { ProductId: productId, widthcm } })
    .pipe(catchError(this.handleError));
}
 
getShadePlusPrice(productId: number, widthcm: number): Observable<number> {
  return this.http.get<number>(`${this.apiUrl}/GeShadePlusPriceForProduct`, { params: { ProductId: productId, widthcm } })
    .pipe(catchError(this.handleError));
}
 
getValanceStylePrice(productId: number, widthcm: number): Observable<number> {
  return this.http.get<number>(`${this.apiUrl}/GeValanceStylePriceForProduct`, { params: { ProductId: productId, widthcm } })
    .pipe(catchError(this.handleError));
}
 
getWallSealingProfilePrice(productId: number, widthcm: number): Observable<number> {
  return this.http.get<number>(`${this.apiUrl}/GeWallSealingProfilerPriceForProduct`, { params: { ProductId: productId, widthcm } })
    .pipe(catchError(this.handleError));
}
 
getShadePlusOptions(
  productId: number,
  widthcm: number
): Observable<{ options: { shadePlusId: number; description: string; price: number }[]; hasMultiple: boolean }> {

  return this.http.get<{ 
    options: { shadePlusId: number; description: string; price: number }[]; 
    hasMultiple: boolean 
  }>(
    `${this.apiUrl}/GetShadePlusOptionsForProduct`,
    { params: { ProductId: productId, widthcm } }
  ).pipe(
    map(r => ({
      options: r?.options ?? [],
      hasMultiple: r?.hasMultiple ?? false
    })),
    catchError(() => of({ options: [], hasMultiple: false }))
  );
}

  /**
   * @deprecated – no backend endpoint for this. Retained for compatibility.
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