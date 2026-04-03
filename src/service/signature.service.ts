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

  // ── Format choices ────────────────────────────────────────────────────────
  /** Greeting line e.g. "Kindest regards," */
  greetingText: string;
  /** "blank_line" | "single_dash" | "double_dash" | "none" */
  separatorStyle: string;
  /** "name_first" | "company_first" */
  layoutOrder: string;

  // ── Font choice (applies to preview textarea & builder preview) ──────────
  /**
   * Short font token stored in DB, e.g. "georgia", "times", "arial", "verdana",
   * "trebuchet", "courier", "palatino", "garamond".
   * Defaults to "georgia".
   */
  fontFamily: string;

  // ── Final rendered plain-text (appended to outgoing emails) ──────────────
  signatureText: string;

  isDefault: boolean;
  dateCreated?: string | Date | null;
  dateUpdated?: string | Date | null;
}

/**
 * Signature endpoints are now served by WorkflowController under
 * /api/workflow/signatures/...  (UserSignatureController has been removed).
 */
@Injectable({ providedIn: 'root' })
export class SignatureService {

  /** Base URL now lives under the workflow controller. */
  private readonly apiUrl = `${environment.apiUrl}/api/workflow/signatures`;

  constructor(private http: HttpClient) {}

  /** GET /api/workflow/signatures */
  getSignatures(): Observable<UserSignatureDto[]> {
    return this.http.get<UserSignatureDto[]>(this.apiUrl)
      .pipe(catchError(this.handleError));
  }

  /** POST /api/workflow/signatures */
  createSignature(dto: UserSignatureDto): Observable<UserSignatureDto> {
    return this.http.post<UserSignatureDto>(this.apiUrl, dto)
      .pipe(catchError(this.handleError));
  }

  /** PUT /api/workflow/signatures/{id} */
  updateSignature(id: number, dto: UserSignatureDto): Observable<UserSignatureDto> {
    return this.http.put<UserSignatureDto>(`${this.apiUrl}/${id}`, dto)
      .pipe(catchError(this.handleError));
  }

  /** PUT /api/workflow/signatures/{id}/default */
  setDefault(id: number): Observable<UserSignatureDto> {
    return this.http.put<UserSignatureDto>(`${this.apiUrl}/${id}/default`, {})
      .pipe(catchError(this.handleError));
  }

  /** DELETE /api/workflow/signatures/{id} */
  deleteSignature(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  // ── Error handler ─────────────────────────────────────────────────────────

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
    console.error('SignatureService error:', msg, error);
    return throwError(() => new Error(msg));
  }
}