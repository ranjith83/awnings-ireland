// auth.service.ts
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../app/environments/environment';

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe: boolean;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  department?: string;
}

export interface AuthResponse {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface User {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/auth`;
  private currentUserSubject: BehaviorSubject<User | null>;
  public currentUser: Observable<User | null>;
  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    // Check if running in browser
    this.isBrowser = isPlatformBrowser(platformId);
    
    // Safe localStorage access
    let storedUser: User | null = null;
    if (this.isBrowser) {
      try {
        const userStr = localStorage.getItem('currentUser');
        storedUser = userStr ? JSON.parse(userStr) : null;
      } catch (error) {
        console.error('Error reading from localStorage:', error);
      }
    }
    
    this.currentUserSubject = new BehaviorSubject<User | null>(storedUser);
    this.currentUser = this.currentUserSubject.asObservable();
  }

  public get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  public get isAuthenticated(): boolean {
    return !!this.currentUserValue && !!this.getToken();
  }

  public get isAdmin(): boolean {
    return this.currentUserValue?.role === 'Admin';
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap(response => {
          this.setAuthData(response);
        }),
        catchError(this.handleError)
      );
  }

  register(userData: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, userData)
      .pipe(
        tap(response => {
          this.setAuthData(response);
        }),
        catchError(this.handleError)
      );
  }

  logout(): void {
    const refreshToken = this.getFromStorage('refreshToken');
    
    if (refreshToken) {
      this.http.post(`${this.apiUrl}/logout`, { refreshToken })
        .subscribe({
          next: () => console.log('Logged out successfully'),
          error: (error) => console.error('Logout error:', error)
        });
    }

    this.clearAuthData();
    this.router.navigate(['/login']);
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getFromStorage('refreshToken');
    
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh-token`, { refreshToken })
      .pipe(
        tap(response => {
          this.setAuthData(response);
        }),
        catchError(error => {
          this.clearAuthData();
          this.router.navigate(['/login']);
          return throwError(() => error);
        })
      );
  }

  changePassword(currentPassword: string, newPassword: string, confirmNewPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-password`, {
      currentPassword,
      newPassword,
      confirmNewPassword
    }).pipe(catchError(this.handleError));
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/me`)
      .pipe(catchError(this.handleError));
  }

  getToken(): string | null {
    return this.getFromStorage('token');
  }

  getRefreshToken(): string | null {
    return this.getFromStorage('refreshToken');
  }

 // Get all users (Admin only)
getAllUsers(): Observable<User[]> {
  return this.http.get<User[]>(`${this.apiUrl}/users`)
    .pipe(catchError(this.handleError));
}

// Update user (Admin only)
updateUser(userId: number, updateData: any): Observable<User> {
  return this.http.put<User>(`${this.apiUrl}/${userId}`, updateData)
    .pipe(catchError(this.handleError));
}

// Deactivate user (Admin only)
deactivateUser(userId: number): Observable<any> {
  return this.http.patch(`${this.apiUrl}/${userId}/deactivate`, {})
    .pipe(catchError(this.handleError));
}

// Activate user (Admin only)
activateUser(userId: number): Observable<any> {
  return this.http.patch(`${this.apiUrl}/${userId}/activate`, {})
    .pipe(catchError(this.handleError));
}

// Delete user (Admin only)
deleteUser(userId: number): Observable<any> {
  return this.http.delete(`${this.apiUrl}/${userId}`)
    .pipe(catchError(this.handleError));
}


  private setAuthData(response: AuthResponse): void {
    // Store tokens
    this.setInStorage('token', response.token);
    this.setInStorage('refreshToken', response.refreshToken);

    // Store user data
    const user: User = {
      userId: response.userId,
      username: response.username,
      email: response.email,
      firstName: response.firstName,
      lastName: response.lastName,
      role: response.role,
      department: response.department
    };

    this.setInStorage('currentUser', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  private clearAuthData(): void {
    this.removeFromStorage('token');
    this.removeFromStorage('refreshToken');
    this.removeFromStorage('currentUser');
    this.currentUserSubject.next(null);
  }

  // Safe localStorage wrapper methods
  private getFromStorage(key: string): string | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error reading ${key} from localStorage:`, error);
      return null;
    }
  }

  private setInStorage(key: string, value: string): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error writing ${key} to localStorage:`, error);
    }
  }

  private removeFromStorage(key: string): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing ${key} from localStorage:`, error);
    }
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      if (error.status === 401) {
        errorMessage = error.error?.message || 'Invalid credentials';
      } else if (error.status === 400) {
        errorMessage = error.error?.message || 'Bad request';
      } else if (error.status === 500) {
        errorMessage = 'Server error. Please try again later';
      } else {
        errorMessage = error.error?.message || `Error Code: ${error.status}`;
      }
    }

    console.error('Auth Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }  
}