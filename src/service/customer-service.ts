import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { CreateCustomerDto, Customer, CustomerListResponse, CustomerSearchFilters, UpdateCustomerDto } from '../model/customer.model';


@Injectable({
  providedIn: 'root'
})


export class CustomerService {
  private apiUrl = 'https://your-api-domain.com/api/customers'; // Change to your API URL
  private customersSubject = new BehaviorSubject<Customer[]>([]);
  public customers$ = this.customersSubject.asObservable();

  constructor(private http: HttpClient) {}

  // GET: Fetch all customers
  getCustomers(): Observable<Customer[]> {
 const staticCustomers: Customer[] = [
    { companyName: 'Dell', contact: 'Joe Bloggs', mobile: '987456321', email: 'joe@dell.ie', siteAddress: '27 Bray Rd, Wicklow' },
    { companyName: 'HP', contact: 'Jane Smith', mobile: '123456789', email: 'jane@hp.com', siteAddress: '12 Main St, Dublin' },
    { companyName: 'Lenovo', contact: 'Mark Lee', mobile: '456789123', email: 'mark@lenovo.com', siteAddress: '45 Tech Park, Cork' },
    { companyName: 'Apple', contact: 'Lisa Ray', mobile: '789123456', email: 'lisa@apple.com', siteAddress: '1 Infinite Loop, Galway' },
    { companyName: 'Acer', contact: 'Tom Hanks', mobile: '321654987', email: 'tom@acer.com', siteAddress: '88 River Rd, Limerick' },
    { companyName: 'Asus', contact: 'Emma Stone', mobile: '654987321', email: 'emma@asus.com', siteAddress: '23 Hilltop Ave, Waterford' },
    { companyName: 'Samsung', contact: 'Chris Pine', mobile: '987321654', email: 'chris@samsung.com', siteAddress: '99 Ocean Blvd, Sligo' },
    { companyName: 'Microsoft', contact: 'Natalie Portman', mobile: '741852963', email: 'natalie@microsoft.com', siteAddress: '77 Cloud St, Kilkenny' },
    { companyName: 'Google', contact: 'Ryan Gosling', mobile: '852963741', email: 'ryan@google.com', siteAddress: '66 Search Ln, Wexford' },
    { companyName: 'Amazon', contact: 'Scarlett Johansson', mobile: '963741852', email: 'scarlett@amazon.com', siteAddress: '55 Prime Rd, Meath' }
 ];
 return of(staticCustomers).pipe(
    tap(customers => this.customersSubject.next(customers)),
    catchError(this.handleError)
  );

    return this.http.get<Customer[]>(this.apiUrl).pipe(
      tap(customers => this.customersSubject.next(customers)),
      catchError(this.handleError)
    );
  }

  // GET: Fetch customers with pagination
  getCustomersPaginated(page: number = 1, pageSize: number = 10): Observable<CustomerListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    return this.http.get<CustomerListResponse>(`${this.apiUrl}/paginated`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  // GET: Fetch single customer by ID
  getCustomerById(id: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.apiUrl}/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  // POST: Create new customer
  createCustomer(customer: CreateCustomerDto): Observable<Customer> {
    return this.http.post<Customer>(this.apiUrl, customer).pipe(
      tap(newCustomer => {
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next([...currentCustomers, newCustomer]);
      }),
      catchError(this.handleError)
    );
  }

  // PUT: Update existing customer
  updateCustomer(id: number, customer: UpdateCustomerDto): Observable<Customer> {
    return this.http.put<Customer>(`${this.apiUrl}/${id}`, customer).pipe(
      tap(updatedCustomer => {
        const currentCustomers = this.customersSubject.value;
        const index = currentCustomers.findIndex(c => c.id === id);
        if (index !== -1) {
          currentCustomers[index] = updatedCustomer;
          this.customersSubject.next([...currentCustomers]);
        }
      }),
      catchError(this.handleError)
    );
  }

  // DELETE: Delete customer
  deleteCustomer(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next(currentCustomers.filter(c => c.id !== id));
      }),
      catchError(this.handleError)
    );
  }

  // POST: Search customers with filters
  searchCustomers(filters: CustomerSearchFilters): Observable<Customer[]> {
    return this.http.post<Customer[]>(`${this.apiUrl}/search`, filters).pipe(
      catchError(this.handleError)
    );
  }

  // GET: Search customers with query params
  searchCustomersQuery(filters: CustomerSearchFilters): Observable<Customer[]> {
    let params = new HttpParams();
    
    if (filters.companyName) params = params.set('companyName', filters.companyName);
    if (filters.contact) params = params.set('contact', filters.contact);
    if (filters.mobile) params = params.set('mobile', filters.mobile);
    if (filters.email) params = params.set('email', filters.email);
    if (filters.siteAddress) params = params.set('siteAddress', filters.siteAddress);

    return this.http.get<Customer[]>(`${this.apiUrl}/search`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  // Error handling
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      
      // You can customize error messages based on status codes
      switch (error.status) {
        case 400:
          errorMessage = 'Bad Request: Please check your input';
          break;
        case 401:
          errorMessage = 'Unauthorized: Please login';
          break;
        case 403:
          errorMessage = 'Forbidden: You do not have permission';
          break;
        case 404:
          errorMessage = 'Not Found: Customer does not exist';
          break;
        case 500:
          errorMessage = 'Internal Server Error: Please try again later';
          break;
      }
    }
    
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}

