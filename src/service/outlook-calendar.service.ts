import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../app/environments/environment';

export interface OutlookEvent {
  subject: string;
  body: {
    contentType: string;
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: string;
  }>;
}

export interface ShowroomInvite {
  workflowId: number;
  customerId: number;
  customerEmail: string;
  customerName: string;
  eventName: string;
  description: string;
  eventDate: Date;
  endDate?: Date;
  timeSlot: string;
  emailClient: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OutlookCalendarService {
  private apiUrl = `${environment.apiUrl}/api/outlook`;

  constructor(private http: HttpClient) {}

  createShowroomInvite(invite: ShowroomInvite): Observable<any> {
    return this.http.post(`${this.apiUrl}/create-showroom-invite`, invite);
  }

  getCalendarEvents(startDate: string, endDate: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/events`, {
      params: { startDate, endDate }
    });
  }

  updateCalendarEvent(eventId: string, event: OutlookEvent): Observable<any> {
    return this.http.put(`${this.apiUrl}/events/${eventId}`, event);
  }

  deleteCalendarEvent(eventId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/events/${eventId}`);
  }

  sendShowroomInviteEmail(invite: ShowroomInvite): Observable<any> {
    return this.http.post(`${this.apiUrl}/send-invite-email`, invite);
  }
}