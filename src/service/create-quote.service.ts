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
  discountType?: string; // 'Percentage' or 'Fixed'
  discountValue?: number;
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
  discountType?: string;
  discountValue?: number;
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
  discountType?: string;
  discountValue?: number;
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

  getAllQuotes(): Observable<QuoteDto[]> {
    return this.http.get<QuoteDto[]>(this.apiUrl)
      .pipe(catchError(this.handleError));
  }

  getQuotesByWorkflowId(workflowId: number): Observable<QuoteDto[]> {
    return this.http.get<QuoteDto[]>(`${this.apiUrl}/workflow/${workflowId}`)
      .pipe(catchError(this.handleError));
  }

  getQuoteById(quoteId: number): Observable<QuoteDto> {
    return this.http.get<QuoteDto>(`${this.apiUrl}/${quoteId}`)
      .pipe(catchError(this.handleError));
  }

  createQuote(createDto: CreateQuoteDto): Observable<QuoteDto> {
    // Sanitise discount fields before sending:
    // Send null (not undefined/empty-string) when no discount type is selected
    // so the backend's IsNullOrWhiteSpace check fires correctly.
    const sanitised: CreateQuoteDto = {
      ...createDto,
      discountType:  createDto.discountType?.trim() || undefined,
      discountValue: createDto.discountType?.trim() ? (createDto.discountValue ?? 0) : 0
    };
    return this.http.post<QuoteDto>(this.apiUrl, sanitised)
      .pipe(catchError(this.handleError));
  }

  updateQuote(quoteId: number, updateDto: UpdateQuoteDto): Observable<QuoteDto> {
    return this.http.put<QuoteDto>(`${this.apiUrl}/${quoteId}`, updateDto)
      .pipe(catchError(this.handleError));
  }

  deleteQuote(quoteId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${quoteId}`)
      .pipe(catchError(this.handleError));
  }

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
        default:
          errorMessage = error.error?.message || `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}