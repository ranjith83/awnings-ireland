import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

export interface OptionLookupDto {
  id: number;
  category: string;
  label: string;
  value: string;
  price?: number;
  displayOrder: number;
}

@Injectable({ providedIn: 'root' })
export class OptionLookupService {
  private apiUrl = `${environment.apiUrl}/api/OptionLookup`;

  constructor(private http: HttpClient) {}

  getByCategory(category: string): Observable<OptionLookupDto[]> {
    return this.http.get<OptionLookupDto[]>(`${this.apiUrl}?category=${encodeURIComponent(category)}`)
      .pipe(catchError(() => throwError(() => new Error(`Failed to load ${category} options`))));
  }
}
