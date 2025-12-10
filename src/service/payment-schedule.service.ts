import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

// DTOs for Payment Schedule
export interface PaymentScheduleDto {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  description: string;
  percentage: number;
  amount: number;
  dueDate: string | Date;
  status: 'Pending' | 'Paid' | 'Overdue' | 'Partially Paid';
  amountPaid: number;
  amountDue: number;
  reference: string;
  paymentDate?: string | Date;
  createdAt: string | Date;
  createdBy: string;
}

export interface CreatePaymentScheduleDto {
  invoiceId: number;
  productCategory: 'Renson' | 'Awnings' | 'Stock Items';
  scheduleItems: CreatePaymentScheduleItemDto[];
}

export interface CreatePaymentScheduleItemDto {
  description: string;
  percentage: number;
  amount: number;
  dueDate: string | Date;
  reference: string;
}

export interface UpdatePaymentScheduleItemDto {
  description?: string;
  percentage?: number;
  amount?: number;
  dueDate?: string | Date;
  status?: string;
  reference?: string;
}

export interface RecordSchedulePaymentDto {
  paymentDate: string | Date;
  amount: number;
  reference: string;
  notes?: string;
}

export interface PaymentScheduleSummaryDto {
  invoiceId: number;
  invoiceNumber: string;
  totalAmount: number;
  totalPaid: number;
  totalDue: number;
  scheduleItems: PaymentScheduleDto[];
}

@Injectable({
  providedIn: 'root'
})
export class PaymentScheduleService {
  private apiUrl = `${environment.apiUrl}/api/PaymentSchedule`;

  constructor(private http: HttpClient) {}

  /**
   * Get all payment schedules
   * Maps to: GET /api/PaymentSchedule
   */
  getAllPaymentSchedules(): Observable<PaymentScheduleDto[]> {
    return this.http.get<PaymentScheduleDto[]>(this.apiUrl)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get payment schedule by invoice ID
   * Maps to: GET /api/PaymentSchedule/invoice/{invoiceId}
   */
  getPaymentScheduleByInvoiceId(invoiceId: number): Observable<PaymentScheduleDto[]> {
    return this.http.get<PaymentScheduleDto[]>(`${this.apiUrl}/invoice/${invoiceId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get payment schedule summary by invoice ID
   * Maps to: GET /api/PaymentSchedule/invoice/{invoiceId}/summary
   */
  getPaymentScheduleSummary(invoiceId: number): Observable<PaymentScheduleSummaryDto> {
    return this.http.get<PaymentScheduleSummaryDto>(`${this.apiUrl}/invoice/${invoiceId}/summary`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get payment schedule item by ID
   * Maps to: GET /api/PaymentSchedule/{id}
   */
  getPaymentScheduleItemById(id: number): Observable<PaymentScheduleDto> {
    return this.http.get<PaymentScheduleDto>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Create payment schedule
   * Maps to: POST /api/PaymentSchedule
   */
  createPaymentSchedule(createDto: CreatePaymentScheduleDto): Observable<PaymentScheduleDto[]> {
    return this.http.post<PaymentScheduleDto[]>(this.apiUrl, createDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update payment schedule item
   * Maps to: PUT /api/PaymentSchedule/{id}
   */
  updatePaymentScheduleItem(id: number, updateDto: UpdatePaymentScheduleItemDto): Observable<PaymentScheduleDto> {
    return this.http.put<PaymentScheduleDto>(`${this.apiUrl}/${id}`, updateDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Record payment for schedule item
   * Maps to: POST /api/PaymentSchedule/{id}/record-payment
   */
  recordPayment(id: number, paymentDto: RecordSchedulePaymentDto): Observable<PaymentScheduleDto> {
    return this.http.post<PaymentScheduleDto>(`${this.apiUrl}/${id}/record-payment`, paymentDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete payment schedule item
   * Maps to: DELETE /api/PaymentSchedule/{id}
   */
  deletePaymentScheduleItem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete entire payment schedule for an invoice
   * Maps to: DELETE /api/PaymentSchedule/invoice/{invoiceId}
   */
  deletePaymentScheduleByInvoiceId(invoiceId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/invoice/${invoiceId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Export payment schedule to Xero
   * Maps to: POST /api/PaymentSchedule/invoice/{invoiceId}/export-xero
   */
  exportToXero(invoiceId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/invoice/${invoiceId}/export-xero`, {})
      .pipe(catchError(this.handleError));
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
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

    console.error('Payment Schedule Service Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}