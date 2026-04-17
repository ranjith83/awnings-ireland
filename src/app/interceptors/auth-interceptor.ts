// auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../../service/auth.service'

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Attach token to every outgoing request
    const token = this.authService.getToken();
    const authReq = token ? this.addToken(req, token) : req;

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          return this.handle401Error(authReq, next);
        }
        return throwError(() => error);
      })
    );
  }

  private handle401Error(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // If a refresh is already in progress, queue this request until done
    if (this.isRefreshing) {
      return this.refreshTokenSubject.pipe(
        filter(token => token !== null),
        take(1),
        switchMap(token => next.handle(this.addToken(req, token!)))
      );
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    const refreshToken = this.authService.getRefreshToken();

    // No refresh token available — session is fully expired, redirect to login
    if (!refreshToken) {
      return this.redirectToLogin();
    }

    return this.authService.refreshToken().pipe(
      switchMap((response) => {
        this.isRefreshing = false;
        this.refreshTokenSubject.next(response.token);
        // Retry the original request with the new token
        return next.handle(this.addToken(req, response.token));
      }),
      catchError((refreshError) => {
        // Refresh token itself failed (expired or revoked) — force logout
        this.isRefreshing = false;
        return this.redirectToLogin();
      })
    );
  }

  private addToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
    return req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  private redirectToLogin(): Observable<never> {
    // Clear stale auth data and send user to login with a message
    this.authService.logout();
    this.router.navigate(['/login'], {
      queryParams: { sessionExpired: 'true' }
    });
    return throwError(() => new Error('Session expired. Please log in again.'));
  }
}