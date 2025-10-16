import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProductModel, Supplier, Workflow } from '../model/workflow.model';
import { Quote, QuoteItem } from '../model/create-quote';


@Injectable({
  providedIn: 'root'
})
export class CreateQuoteService {
  private apiUrl = 'https://your-api-domain.com/api';

  constructor(private http: HttpClient) {}

  getWorkflows(): Observable<Workflow[]> {
    return this.http.get<Workflow[]>(`${this.apiUrl}/workflows`);
  }

  getSuppliers(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${this.apiUrl}/suppliers`);
  }

  getModelsBySupplier(supplierId: number): Observable<ProductModel[]> {
    return this.http.get<ProductModel[]>(`${this.apiUrl}/models?supplierId=${supplierId}`);
  }

  getQuoteItems(): Observable<QuoteItem[]> {
    return this.http.get<QuoteItem[]>(`${this.apiUrl}/quote-items`);
  }

  createQuote(quote: Quote): Observable<Quote> {
    return this.http.post<Quote>(`${this.apiUrl}/quotes`, quote);
  }

  generateQuotePDF(quoteId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/quotes/${quoteId}/pdf`, { responseType: 'blob' });
  }
}
