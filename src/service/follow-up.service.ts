import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

export interface FollowUpDto {
  followUpId: number;
  workflowId: number;
  customerId: number | null;
  companyName: string;

  // ── Enquiry data ─────────────────────────────────────────────────────────
  enquiryId: number;
  enquiryEmail: string | null;
  enquiryComments: string | null;
  /** ISO date string — the DateCreated of the triggering InitialEnquiry */
  lastEnquiryDate: string;

  // ── Display fields ───────────────────────────────────────────────────────
  subject: string;
  category: string;
  dateAdded: string;
  isDismissed: boolean;
  dismissReason: string | null;
  notes: string | null;
  resolvedDate: string | null;
  resolvedBy: string | null;
  taskId: number | null;
}

@Injectable({ providedIn: 'root' })
export class FollowUpService {
  private apiUrl = `${environment.apiUrl}/api/followup`;

  /** Live count of active follow-ups — feeds the sidebar menu badge, same as SetupSiteVisitService.pendingCount$. */
  private pendingCountSubject = new BehaviorSubject<number>(0);
  pendingCount$ = this.pendingCountSubject.asObservable();

  constructor(private http: HttpClient) {}

  /** GET /api/followup — active (non-dismissed) follow-ups */
  getActiveFollowUps(): Observable<FollowUpDto[]> {
    return this.http.get<FollowUpDto[]>(this.apiUrl)
      .pipe(
        tap(list => this.pendingCountSubject.next(list.length)),
        catchError(this.handleError)
      );
  }

  /** Refreshes pendingCount$ — call after generating/dismissing follow-ups so the sidebar badge stays in sync. */
  refreshPendingCount(): void {
    this.getActiveFollowUps().subscribe();
  }

  /** GET /api/followup/all — all including dismissed */
  getAllFollowUps(): Observable<FollowUpDto[]> {
    return this.http.get<FollowUpDto[]>(`${this.apiUrl}/all`)
      .pipe(catchError(this.handleError));
  }

  /** POST /api/followup/generate — scan for stale enquiries and create records */
  generateFollowUps(): Observable<{ message: string; created: number }> {
    return this.http.post<{ message: string; created: number }>(
      `${this.apiUrl}/generate`, {}
    ).pipe(catchError(this.handleError));
  }

  /** POST /api/followup/{id}/dismiss */
  dismissFollowUp(followUpId: number, notes?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/${followUpId}/dismiss`, { notes: notes ?? '' }
    ).pipe(catchError(this.handleError));
  }

  private handleError(error: any): Observable<never> {
    console.error('FollowUpService error:', error);
    return throwError(() => new Error(error?.error?.error ?? error.message ?? 'Unknown error'));
  }
}