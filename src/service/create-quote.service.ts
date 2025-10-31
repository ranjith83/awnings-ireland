import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';
// DTOs matching C# backend
export interface QuoteDto {
  quoteId: number;
  workflowId: number;
  quoteNumber: string;
  quoteDate: string | Date;
  followUpDate: string | Date;
  subTotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
  createdBy: string;
  updatedBy?: string;
  customerId: number;
  quoteItems: QuoteItemDto[];
}

export interface QuoteItemDto {
  quoteItemId?: number;
  quoteId?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  totalPrice: number;
  sortOrder?: number;
}

export interface CreateQuoteDto {
  workflowId: number;
  quoteDate: string | Date;
  followUpDate: string | Date;
  customerId: number;
  notes?: string;
  terms?: string;
  quoteItems: CreateQuoteItemDto[];
}

export interface CreateQuoteItemDto {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discountPercentage?: number;
}

export interface UpdateQuoteDto {
  quoteDate?: string | Date;
  followUpDate?: string | Date;
  notes?: string;
  terms?: string;
  quoteItems?: UpdateQuoteItemDto[];
}

export interface UpdateQuoteItemDto {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
}


@Injectable({
  providedIn: 'root'
})
export class CreateQuoteService {
 private apiUrl = `${environment.apiUrl}/api/Quote`;
  private productApiUrl = `${environment.apiUrl}/api/Product`;

  constructor(private http: HttpClient) {}

  /**
   * Get all quotes
   * Maps to: GET /api/Quote
   */
  getAllQuotes(): Observable<QuoteDto[]> {
    return this.http.get<QuoteDto[]>(this.apiUrl)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get quotes by workflow ID
   * Maps to: GET /api/Quote/workflow/{workflowId}
   */
  getQuotesByWorkflowId(workflowId: number): Observable<QuoteDto[]> {
    return this.http.get<QuoteDto[]>(`${this.apiUrl}/workflow/${workflowId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get quote by ID
   * Maps to: GET /api/Quote/{quoteId}
   */
  getQuoteById(quoteId: number): Observable<QuoteDto> {
    return this.http.get<QuoteDto>(`${this.apiUrl}/${quoteId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Create a new quote
   * Maps to: POST /api/Quote
   */
  createQuote(createDto: CreateQuoteDto): Observable<QuoteDto> {
    return this.http.post<QuoteDto>(this.apiUrl, createDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update an existing quote
   * Maps to: PUT /api/Quote/{quoteId}
   */
  updateQuote(quoteId: number, updateDto: UpdateQuoteDto): Observable<QuoteDto> {
    return this.http.put<QuoteDto>(`${this.apiUrl}/${quoteId}`, updateDto)
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete a quote
   * Maps to: DELETE /api/Quote/{quoteId}
   */
  deleteQuote(quoteId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${quoteId}`)
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
        default:
          errorMessage = error.error?.message || `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}