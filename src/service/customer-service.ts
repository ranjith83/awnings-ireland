// services/customer.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

// Interfaces matching your C# DTOs exactly
export interface CustomerMainViewDto {
  customerId: number;
  companyName: string;
  contactName: string;
  contactEmail: string;
  mobilePhone: string;
  siteAddress: string;
  assignedSalesperson: string;
}

export interface Customer {
  customerId: number;
  name: string;
  companyNumber?: string;
  residential?: boolean;
  registrationNumber?: string;
  vatNumber?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  county?: string;
  countryId?: number;
  phone?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  taxNumber?: string;
  eircode?: string;
  dateCreated?: Date;
  createdBy?: number;
  updatedDate?: Date;
  updatedBy?: number;
  customerContacts?: CustomerContact[];
  assignedSalespersonId?: number;
  assignedSalespersonName?: string;
}

export interface CustomerContact {
  contactId?: number;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  mobile?: string;
  phone?: string;
  email: string;
  customerId?: number;
}

export interface CompanyWithContactDto {
  customerId?: number;
  name: string;
  companyNumber?: string;
  residential?: boolean;
  registrationNumber?: string;
  vatNumber?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  county?: string;
  countryId?: number;
  phone?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  taxNumber?: string;
  eircode?: string;
  dateCreated?: Date;
  createdBy?: number;
  updatedDate?: Date;
  updatedBy?: number;
  contacts: CustomerContactDto[];
  assignedSalespersonId?: number;
  assignedSalespersonName?: string;
}

export interface CustomerContactDto {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

export interface CompanyDto {
  customerId: number;
  name: string;
  companyNumber?: string;
  residential?: boolean;
  registrationNumber?: string;
  vatNumber?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  county?: string;
  countryId?: number;
  phone?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  taxNumber?: string;
  eircode?: string;
  updatedDate?: Date;
  updatedBy?: number;
  assignedSalespersonId?: number;
  assignedSalespersonName?: string;
}

export interface ContactDto {
  customerID: number;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: Date;
  mobile?: string;
  phone?: string;
  updatedBy?: number;
}

export interface SalespersonDto {
  userId: number;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private apiUrl = `${environment.apiUrl}/api/customers`;
  private authUrl = `${environment.apiUrl}/api/auth`;

  constructor(private http: HttpClient) {}

  /**
   * Get all customers with their contacts
   * Maps to: GET /api/customers
   */
  getAllCustomers(): Observable<CustomerMainViewDto[]> {
    return this.http.get<CustomerMainViewDto[]>(this.apiUrl)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Get customer by ID with full details
   * Maps to: GET /api/customers/{id}
   */
  getCustomerById(id: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.apiUrl}/${id}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Get all salespeople (users with department "Sales")
   * Maps to: GET /api/auth/salespeople
   */
  getSalespeople(): Observable<SalespersonDto[]> {
    return this.http.get<SalespersonDto[]>(`${this.authUrl}/salespeople`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Add a new company with contact
   * Maps to: POST /api/customers/add-company-with-contact
   */
  addCompanyWithContact(data: CompanyWithContactDto): Observable<Customer> {
    return this.http.post<Customer>(`${this.apiUrl}/add-company-with-contact`, data)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Delete a company
   * Maps to: POST /api/customers/delete-customer
   */
  deleteCompany(customerId: Number): Observable<Boolean> {
    return this.http.post<Boolean>(`${this.apiUrl}/delete-customer`, customerId)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Add a contact to an existing company
   * Maps to: POST /api/customers/add-contact-to-company
   */
  addContactToCompany(data: ContactDto): Observable<Customer> {
    return this.http.post<Customer>(`${this.apiUrl}/add-contact-to-company`, data)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Update company details
   * Maps to: PUT /api/customers/update-company/{companyId}
   */
  updateCompany(customerId: number, data: CompanyDto): Observable<Customer> {
    return this.http.put<Customer>(`${this.apiUrl}/update-company/${customerId}`, data)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Update contact details
   * Maps to: PUT /api/customers/update-contact/{contactId}
   */
  updateContact(contactId: number, data: ContactDto): Observable<CustomerContact> {
    return this.http.put<CustomerContact>(`${this.apiUrl}/update-contact/${contactId}`, data)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    // SAFE client-side error check (works in SSR)
    const isClientError =
        typeof ErrorEvent !== 'undefined' &&
        error.error instanceof ErrorEvent;

    if (isClientError) {
        errorMessage = `Client Error: ${error.error.message}`;
    } else {
        switch (error.status) {
            case 0:
                errorMessage = 'Unable to connect to server. Please check if the API is running.';
                break;
            case 400:
                errorMessage = 'Bad Request: Please check your input data';
                break;
            case 401:
                errorMessage = 'Unauthorized: Please login again';
                break;
            case 403:
                errorMessage = 'Forbidden: You do not have permission';
                break;
            case 404:
                errorMessage = 'Not Found: The requested resource was not found';
                break;
            case 500:
                errorMessage = 'Internal Server Error: Please try again later';
                break;
            case 503:
                errorMessage = 'Service Unavailable: Server is temporarily unavailable';
                break;
            default:
                errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
        }
    }

    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}