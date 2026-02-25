// audit-trail.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

/**
 * Enum for different types of audit actions
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  VIEW = 'VIEW'
}

/**
 * Enum for entity types being audited
 */
export enum AuditEntityType {
  CUSTOMER = 'CUSTOMER',
  CONTACT = 'CONTACT',
  WORKFLOW = 'WORKFLOW',
  QUOTE = 'QUOTE',
  INVOICE = 'INVOICE',
  SITE_VISIT = 'SITE_VISIT'
}

/**
 * Interface for individual field changes
 */
export interface FieldChange {
  fieldName: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'object';
}

/**
 * DTO for creating an audit log entry
 */
export interface CreateAuditLogDto {
  entityType: AuditEntityType;
  entityId: number;
  entityName?: string; // e.g., Customer name for better readability
  action: AuditAction;
  changes: FieldChange[];
  performedBy: number; // User ID
  performedByName?: string; // User name for display
  ipAddress?: string;
  userAgent?: string;
  notes?: string;
}

/**
 * DTO for audit log response
 */
export interface AuditLogDto {
  id?: number; // Added for trackBy
  auditId: number;
  entityType: AuditEntityType;
  entityId: number;
  entityName?: string;
  action: AuditAction;
  changes: FieldChange[];
  performedBy: number;
  performedByName: string;
  performedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  notes?: string;
}

/**
 * DTO for audit log filter/search
 */
export interface AuditLogFilterDto {
  entityType?: AuditEntityType;
  entityId?: number;
  action?: AuditAction;
  performedBy?: number;
  startDate?: Date;
  endDate?: Date;
  searchTerm?: string;
  pageNumber?: number;
  pageSize?: number;
}

/**
 * DTO for paginated audit log response
 */
export interface AuditLogPagedResultDto {
  items: AuditLogDto[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Interface for audit summary statistics
 */
export interface AuditSummaryDto {
  totalAudits: number;
  totalByAction: {
    creates: number;
    updates: number;
    deletes: number;
    views: number;
  };
  recentActivity: AuditLogDto[];
  topUsers: {
    userId: number;
    userName: string;
    actionCount: number;
  }[];
}

// ── Task Audit interfaces ────────────────────────────────────────────────────
// These mirror the C# TaskHistoryDto / TaskHistoryPagedDto exactly.
// Property names are camelCase because .NET's JSON serialiser lowercases them.
//
// C#  →  JSON/TS
// HistoryId    → historyId
// TaskId       → taskId
// Action       → action
// OldValue     → oldValue
// NewValue     → newValue
// Details      → details
// DateCreated  → dateCreated
// CreatedBy    → createdBy
// CustomerName → customerName
// Subject      → subject
// Category     → category
// AssignedTo   → assignedTo   (new: the assignee name)
// AssignedBy   → assignedBy   (new: who performed the assignment)
// Items        → items
// TotalCount   → totalCount
// Page         → page
// PageSize     → pageSize
// TotalPages   → totalPages

export interface TaskHistoryAuditDto {
  historyId:    number;
  taskId:       number;
  /** 'Created' | 'Assigned' | 'Unassigned' */
  action:       string;
  oldValue:     string | null;
  newValue:     string | null;
  details:      string | null;
  dateCreated:  string;
  createdBy:    string | null;
  /** Populated for Created / Assigned / Unassigned; null for other actions */
  customerName: string | null;
  subject:      string | null;
  category:     string | null;
  /** The user the task is/was assigned TO (newValue for Assigned, oldValue for Unassigned) */
  assignedTo:   string | null;
  /** The user who performed the assignment action (createdBy) */
  assignedBy:   string | null;
}

export interface TaskHistoryPagedDto {
  items:      TaskHistoryAuditDto[];
  totalCount: number;
  page:       number;
  pageSize:   number;
  totalPages: number;
}
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({
  providedIn: 'root'
})
export class AuditTrailService {
  private apiUrl = `${environment.apiUrl}/api/AuditLog`;

  constructor(private http: HttpClient) {}

  /**
   * Create a new audit log entry
   */
  createAuditLog(auditLog: CreateAuditLogDto): Observable<AuditLogDto> {
    return this.http.post<AuditLogDto>(this.apiUrl, auditLog).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get audit logs with filters
   */
  getAuditLogs(filter: AuditLogFilterDto): Observable<AuditLogPagedResultDto> {
    let params = new HttpParams();
    
    if (filter.entityType) params = params.set('entityType', filter.entityType);
    if (filter.entityId !== undefined && filter.entityId !== null) {
      params = params.set('entityId', filter.entityId.toString());
    }
    if (filter.action) params = params.set('action', filter.action);
    if (filter.performedBy) params = params.set('performedBy', filter.performedBy.toString());
    if (filter.startDate) params = params.set('startDate', filter.startDate.toISOString());
    if (filter.endDate) params = params.set('endDate', filter.endDate.toISOString());
    if (filter.searchTerm) params = params.set('searchTerm', filter.searchTerm);
    if (filter.pageNumber) params = params.set('pageNumber', filter.pageNumber.toString());
    if (filter.pageSize) params = params.set('pageSize', filter.pageSize.toString());

    return this.http.get<AuditLogPagedResultDto>(this.apiUrl, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get audit logs for a specific entity
   */
  getEntityAuditLogs(entityType: AuditEntityType, entityId: number): Observable<AuditLogDto[]> {
    // Validate inputs
    if (!entityType) {
      return throwError(() => new Error('Entity type is required'));
    }
    if (entityId === undefined || entityId === null) {
      return throwError(() => new Error('Entity ID is required'));
    }

    const url = `${this.apiUrl}/entity/${entityType}/${entityId}`;
    return this.http.get<AuditLogDto[]>(url).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get audit log by ID
   */
  getAuditLogById(auditId: number): Observable<AuditLogDto> {
    if (!auditId) {
      return throwError(() => new Error('Audit ID is required'));
    }
    
    return this.http.get<AuditLogDto>(`${this.apiUrl}/${auditId}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get audit summary statistics
   */
  getAuditSummary(startDate?: Date, endDate?: Date): Observable<AuditSummaryDto> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate.toISOString());
    if (endDate) params = params.set('endDate', endDate.toISOString());

    return this.http.get<AuditSummaryDto>(`${this.apiUrl}/summary`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Compare two objects and generate field changes
   */
  compareObjects(oldObj: any, newObj: any, fieldLabels: { [key: string]: string }): FieldChange[] {
    const changes: FieldChange[] = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

    allKeys.forEach(key => {
      // Skip internal fields
      if (key.startsWith('_') || key === 'updatedAt' || key === 'updatedBy') {
        return;
      }

      const oldValue = oldObj?.[key];
      const newValue = newObj?.[key];

      // Check if values are different
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          fieldName: key,
          fieldLabel: fieldLabels[key] || this.formatFieldName(key),
          oldValue: oldValue ?? null,
          newValue: newValue ?? null,
          dataType: this.getDataType(newValue ?? oldValue)
        });
      }
    });

    return changes;
  }

  /**
   * Format field name to readable label
   */
  private formatFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Determine data type of a value
   */
  private getDataType(value: any): 'string' | 'number' | 'boolean' | 'date' | 'object' {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  /**
   * Format field change for display
   */
  formatFieldChange(change: FieldChange): string {
    const oldVal = this.formatValue(change.oldValue, change.dataType);
    const newVal = this.formatValue(change.newValue, change.dataType);
    return `${change.fieldLabel}: "${oldVal}" → "${newVal}"`;
  }

  /**
   * Format value based on data type
   */
  private formatValue(value: any, dataType: string): string {
    if (value === null || value === undefined) return 'N/A';
    
    try {
      switch (dataType) {
        case 'date':
          return new Date(value).toLocaleString();
        case 'boolean':
          return value ? 'Yes' : 'No';
        case 'object':
          return JSON.stringify(value);
        default:
          return String(value);
      }
    } catch (error) {
      return String(value);
    }
  }

  // ── Task Audit History (GET /api/EmailTask/audit) ──────────────────────────

  private emailTaskApiUrl = `${environment.apiUrl}/api/EmailTask`;

  /**
   * Fetch paginated Task Audit history from the TaskHistories table.
   * The backend filters to Created | Assigned | Unassigned actions only.
   *
   * @param page      1-based page number
   * @param pageSize  rows per page (default 20)
   * @param action    optional action filter: 'Created' | 'Assigned' | 'Unassigned'
   *
   * Returns TaskHistoryPagedDto whose property names exactly match
   * what C# serialises (camelCase): items, totalCount, page, pageSize, totalPages
   */
  getTaskAuditHistory(
    page: number = 1,
    pageSize: number = 20,
    action?: string
  ): Observable<TaskHistoryPagedDto> {
    let url = `${this.emailTaskApiUrl}/audit?page=${page}&pageSize=${pageSize}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    return this.http.get<TaskHistoryPagedDto>(url).pipe(
      catchError(this.handleError)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Centralized error handler
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      if (error.error?.message) {
        errorMessage = error.error.message;
      }
    }
    
    console.error('AuditTrailService Error:', errorMessage, error);
    return throwError(() => error);
  }
}