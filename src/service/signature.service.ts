import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

export interface UserSignatureDto {
  signatureId?: number;
  label: string;

  // ── Contact fields ────────────────────────────────────────────────────────
  fullName?: string;
  jobTitle?: string;
  company?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;

  // ── Format choices ─────────────────────────────────────────────────────────
  /** Greeting line e.g. "Kindest regards," */
  greetingText: string;
  /** "blank_line" | "single_dash" | "double_dash" | "none" */
  separatorStyle: string;
  /** "name_first" | "company_first" */
  layoutOrder: string;

  // ── Final rendered plain-text (used in emails) ────────────────────────────
  signatureText: string;

  isDefault: boolean;
  dateCreated?: string | Date | null;
  dateUpdated?: string | Date | null;
}

@Injectable({ providedIn: 'root' })
export class SignatureService {
  private apiUrl = `${environment.apiUrl}/api/signatures`;

  constructor(private http: HttpClient) {}

  getSignatures(): Observable<UserSignatureDto[]> {
    return this.http.get<UserSignatureDto[]>(this.apiUrl).pipe(catchError(this.handleError));
  }

  createSignature(dto: UserSignatureDto): Observable<UserSignatureDto> {
    return this.http.post<UserSignatureDto>(this.apiUrl, dto).pipe(catchError(this.handleError));
  }

  updateSignature(id: number, dto: UserSignatureDto): Observable<UserSignatureDto> {
    return this.http.put<UserSignatureDto>(`${this.apiUrl}/${id}`, dto).pipe(catchError(this.handleError));
  }

  setDefault(id: number): Observable<UserSignatureDto> {
    return this.http.put<UserSignatureDto>(`${this.apiUrl}/${id}/default`, {}).pipe(catchError(this.handleError));
  }

  deleteSignature(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`).pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let msg = 'An error occurred';
    if (error.error instanceof ErrorEvent) {
      msg = `Client Error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 0:   msg = 'Unable to connect to server.'; break;
        case 400: msg = 'Bad Request: ' + (error.error?.message ?? 'Check your input.'); break;
        case 401: msg = 'Unauthorised — please log in again.'; break;
        case 404: msg = 'Signature not found.'; break;
        case 500: msg = 'Server error — please try again later.'; break;
        default:  msg = `Error ${error.status}: ${error.message}`;
      }
    }
    return throwError(() => new Error(msg));
  }
}