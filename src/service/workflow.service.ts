import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {  Workflow } from '../model/workflow.model';
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

export interface InitialEnquiryDto {
  enquiryId?: number;
  workflowId: number;
  comments: string;
  email: string;
  images?: string;
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

  /**
   * Get all workflows for a customer
   * Maps to: GET /api/workflow/GetAllWorfflowsForCustomer
   */
  getWorkflowsForCustomer(customerId: number): Observable<WorkflowDto[]> {
    const params = new HttpParams().set('CustomerId', customerId.toString());
    return this.http.get<WorkflowDto[]>(`${this.apiUrl}/GetAllWorfflowsForCustomer`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Create a new workflow
   * Maps to: POST /api/workflow/CreateWorkflow
   */
  createWorkflow(workflow: WorkflowDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/CreateWorkflow`, workflow)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update an existing workflow
   * Maps to: PUT /api/workflow/UpdateWorkflow
   */
  updateWorkflow(workflow: WorkflowDto): Observable<any> {
    return this.http.put(`${this.apiUrl}/UpdateWorkflow`, workflow)
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete a workflow by ID
   * Maps to: DELETE /api/workflow/DeleteWorkflow/{workflowId}
   */
  deleteWorkflow(workflowId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/DeleteWorkflow/${workflowId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get initial enquiries for a workflow
   * Maps to: GET /api/workflow/GeInitialEnquiryForWorkflow
   */
  getInitialEnquiryForWorkflow(workflowId: number): Observable<InitialEnquiryDto[]> {
    const params = new HttpParams().set('WorkflowId', workflowId.toString());
    return this.http.get<InitialEnquiryDto[]>(`${this.apiUrl}/GeInitialEnquiryForWorkflow`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Add initial enquiry
   * Maps to: POST /api/workflow/AddInitialEnquiry
   */
  addInitialEnquiry(enquiry: InitialEnquiryDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/AddInitialEnquiry`, enquiry)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update initial enquiry
   * Maps to: PUT /api/workflow/UpdateInitialEnquiry
   */
  updateInitialEnquiry(enquiry: InitialEnquiryDto): Observable<any> {
    return this.http.put(`${this.apiUrl}/UpdateInitialEnquiry`, enquiry)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get standard widths for a product
   * Maps to: GET /api/workflow/GetStandardWidthsForProduct
   */
  getStandardWidthsForProduct(productId: number): Observable<number[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<number[]>(`${this.apiUrl}/GetStandardWidthsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }


  /**
   * Get arms for a product
   * Maps to: GET /api/Product/{productId}/arms
   */
getArmsForProduct(productId: number): Observable<ArmDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<ArmDto[]>(`${this.apiUrl}/GeArmsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get motors for a product
   * Maps to: GET /api/Product/{productId}/motors
   */
  getMotorsForProduct(productId: number): Observable<MotorDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<MotorDto[]>(`${this.apiUrl}/GeMotorsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get heaters for a product
   * Maps to: GET /api/Product/{productId}/heaters
   */
  getHeatersForProduct(productId: number): Observable<HeaterDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<HeaterDto[]>(`${this.apiUrl}/GeHeatersForProduct`, { params })
      .pipe(catchError(this.handleError));
  }


  /**
   * Get projection widths for a product
   * Maps to: GET /api/workflow/GetProjectionWidthsForProduct
   */
  getProjectionWidthsForProduct(productId: number): Observable<number[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<number[]>(`${this.apiUrl}/GetProjectionWidthsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get projection price for a product
   * Maps to: GET /api/workflow/GetProjectionPriceForProduct
   */
  getProjectionPriceForProduct(productId: number, widthCm: number, projectionCm: number): Observable<number> {
    const params = new HttpParams()
      .set('ProductId', productId.toString())
      .set('widthcm', widthCm.toString())
      .set('projectioncm', projectionCm.toString());
    
    return this.http.get<number>(`${this.apiUrl}/GetProjectionPriceForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get brackets for a product
   * Maps to: GET /api/workflow/GeBracketsForProduct
   */
  getBracketsForProduct(productId: number): Observable<BracketDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<BracketDto[]>(`${this.apiUrl}/GeBracketsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get fixing points for a product
   * Maps to: GET /api/workflow/GeFixingPointsForProduct
   */
  getFixingPointsForProduct(productId: number): Observable<FixingPointDto[]> {
    const params = new HttpParams().set('ProductId', productId.toString());
    return this.http.get<FixingPointDto[]>(`${this.apiUrl}/GeFixingPointsForProduct`, { params })
      .pipe(catchError(this.handleError));
  }

  // ============================================
  // SUPPLIER ENDPOINTS
  // ============================================

  /**
   * Get all suppliers
   * Maps to: GET /api/suppliers/GetAllSuppliers
   */
  getAllSuppliers(): Observable<SupplierDto[]> {
    return this.http.get<SupplierDto[]>(`${this.supplierApiUrl}/GetAllSuppliers`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get all product types for a supplier
   * Maps to: GET /api/suppliers/GetAllProductTypesForSupplier
   */
  getAllProductTypesForSupplier(supplierId: number): Observable<ProductTypeDto[]> {
    const params = new HttpParams().set('SupplierId', supplierId.toString());
    return this.http.get<ProductTypeDto[]>(`${this.supplierApiUrl}/GetAllProductTypesForSupplier`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get all products by supplier and product type
   * Maps to: GET /api/suppliers/GetAllProductsBySupplier
   */
  getAllProductsBySupplier(supplierId: number, productTypeId: number): Observable<ProductDto[]> {
    const params = new HttpParams()
      .set('SupplierId', supplierId.toString())
      .set('ProductTypeId', productTypeId.toString());
    return this.http.get<ProductDto[]>(`${this.supplierApiUrl}/GetAllProductsBySupplier`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      // Server-side error
      switch (error.status) {
        case 0:
          errorMessage = 'Unable to connect to server. Please check if the API is running.';
          break;
        case 400:
          errorMessage = 'Bad Request: Please check your input data';
          break;
        case 404:
          errorMessage = 'Not Found: The requested resource was not found';
          break;
        case 500:
          errorMessage = 'Internal Server Error: Please try again later';
          break;
        default:
          errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }

  getInitialEnquiryHistory(
    workflowId: number,
    page: number = 1,
    pageSize: number = 20
  ): Observable<{ items: any[]; totalCount: number; page: number; pageSize: number; totalPages: number }> {
    const params = new HttpParams()
      .set('workflowId', workflowId.toString())
      .set('page',       page.toString())
      .set('pageSize',   pageSize.toString());

    return this.http.get<any>(
      `${this.apiUrl}/EmailTask/audit`,   // adjust base URL if needed
      { params }
    );
  }

}