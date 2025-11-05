import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

// DTOs matching C# backend
export interface InvoiceDto {
  id: number;
  workflowId: number;
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date;
  customerId: number;
  customerName: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;
  subTotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  status: string;
  notes: string;
  terms: string;
  createdAt: string | Date;
  createdBy: string;
  invoiceItems: InvoiceItemDto[];
  invoicePayments: InvoicePaymentDto[];
  amountPaid: number;
  amountDue: number;
}

export interface InvoiceItemDto {
  id?: number;
  invoiceId?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  totalPrice: number;
  unit?: string;
  sortOrder?: number;
}

export interface InvoicePaymentDto {
  id: number;
  invoiceId: number;
  paymentDate: string | Date;
  amount: number;
  paymentMethod: string;
  transactionReference: string;
  notes: string;
  createdAt: string | Date;
  createdBy: string;
}

export interface CreateInvoiceDto {
  workflowId: number;
  invoiceDate: string | Date;
  dueDate: string | Date;
  customerId: number;
  notes?: string;
  terms?: string;
  invoiceItems: CreateInvoiceItemDto[];
}

export interface CreateInvoiceItemDto {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercentage?: number;
  unit?: string;
}

export interface UpdateInvoiceDto {
  invoiceDate?: string | Date;
  dueDate?: string | Date;
  status?: string;
  notes?: string;
  terms?: string;
  invoiceItems?: UpdateInvoiceItemDto[];
}

export interface UpdateInvoiceItemDto {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  unit?: string;
}

export interface CreatePaymentDto {
  paymentDate: string | Date;
  amount: number;
  paymentMethod: string;
  transactionReference?: string;
  notes?: string;
}

export interface UpdateStatusDto {
  status: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private apiUrl = `${environment.apiUrl}/api/Invoice`;

  constructor(private http: HttpClient) {}

  /**
   * Get all invoices
   * Maps to: GET /api/Invoice
   */
  getAllInvoices(): Observable<InvoiceDto[]> {
    return this.http.get<InvoiceDto[]>(this.apiUrl)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get invoices by workflow ID
   * Maps to: GET /api/Invoice/workflow/{workflowId}
   */
  getInvoicesByWorkflowId(workflowId: number): Observable<InvoiceDto[]> {
    return this.http.get<InvoiceDto[]>(`${this.apiUrl}/workflow/${workflowId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get invoice by ID
   * Maps to: GET /api/Invoice/{id}
   */
  getInvoiceById(id: number): Observable<InvoiceDto> {
    return this.http.get<InvoiceDto>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Create a new invoice
   * Maps to: POST /api/Invoice
   */
  createInvoice(createDto: CreateInvoiceDto): Observable<InvoiceDto> {
    return this.http.post<InvoiceDto>(this.apiUrl, createDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update an existing invoice
   * Maps to: PUT /api/Invoice/{id}
   */
  updateInvoice(id: number, updateDto: UpdateInvoiceDto): Observable<InvoiceDto> {
    return this.http.put<InvoiceDto>(`${this.apiUrl}/${id}`, updateDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete an invoice
   * Maps to: DELETE /api/Invoice/{id}
   */
  deleteInvoice(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update invoice status
   * Maps to: PATCH /api/Invoice/{id}/status
   */
  updateInvoiceStatus(id: number, status: string): Observable<InvoiceDto> {
    const statusDto: UpdateStatusDto = { status };
    return this.http.patch<InvoiceDto>(`${this.apiUrl}/${id}/status`, statusDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Add payment to invoice
   * Maps to: POST /api/Invoice/{id}/payments
   */
  addPayment(id: number, paymentDto: CreatePaymentDto): Observable<InvoicePaymentDto> {
    return this.http.post<InvoicePaymentDto>(`${this.apiUrl}/${id}/payments`, paymentDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Generate PDF for invoice
   * Maps to: GET /api/Invoice/{id}/pdf
   */
  generateInvoicePdf(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/pdf`, { 
      responseType: 'blob' 
    }).pipe(catchError(this.handleError));
  }

  /**
   * Send invoice via email
   * Maps to: POST /api/Invoice/{id}/send
   */
  sendInvoiceEmail(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/send`, {})
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
          errorMessage = error.error?.message || 'Bad Request: Please check your input data';
          break;
        case 404:
          errorMessage = error.error?.message || 'Not Found: The requested resource was not found';
          break;
        case 500:
          errorMessage = error.error?.message || 'Internal Server Error: Please try again later';
          break;
        case 501:
          errorMessage = error.error?.message || 'Not Implemented: This feature is not yet available';
          break;
        default:
          errorMessage = error.error?.message || `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}