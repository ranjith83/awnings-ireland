// audit-history.component.ts
import { Component, OnInit, PLATFORM_ID, Inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  AuditTrailService, 
  AuditLogDto, 
  AuditAction, 
  AuditEntityType, 
  FieldChange,
  AuditLogFilterDto 
} from '../service/audit-trail.service';
import { Observable, of, Subject, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface CustomerDto {
  companyId: number;
  companyName: string;
}

interface UserDto {
  userId: number;
  firstName: string;
  lastName: string;
}

@Component({
  selector: 'app-audit-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-history.component.html',
  styleUrls: ['./audit-history.component.scss']
})
export class AuditHistoryComponent implements OnInit {
  // Signals for reactive state management
  auditLogs = signal<AuditLogDto[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  showFilters = signal(true);
  selectedAudit = signal<AuditLogDto | null>(null);
  showDetailsPopup = signal(false);
  
  // Pagination signals
  currentPage = signal(1);
  pageSize = signal(20);
  totalCount = signal(0);
  totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));
  
  // Observables for dropdowns
  customers$: Observable<CustomerDto[]> = of([]);
  users$: Observable<UserDto[]> = of([]);
  
  // Filter Model
  filterModel: AuditLogFilterDto = {
    pageNumber: 1,
    pageSize: 20
  };
  
  selectedCustomerId: number | null = null;
  startDateString: string = '';
  endDateString: string = '';
  todayString: string = '';
  
  // UI State
  isBrowser = false;
  
  // Search debounce
  private searchSubject = new Subject<string>();
  
  // Enums exposed to template
  auditActions = AuditAction;
  entityTypes = AuditEntityType;
  
  // Cache for lookups
  private customersCache: CustomerDto[] = [];
  private usersCache: UserDto[] = [];

  constructor(
    private auditService: AuditTrailService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    // Set today's date for max date restriction
    const today = new Date();
    this.todayString = this.formatDateForInput(today);
    
    // Set default date range (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    this.startDateString = this.formatDateForInput(thirtyDaysAgo);
    this.endDateString = this.todayString;
    
    // Initialize filter dates
    this.filterModel.startDate = thirtyDaysAgo;
    this.filterModel.endDate = today;

    // Load dropdown data asynchronously
    await Promise.all([
      this.loadCustomers(),
      this.loadUsers()
    ]);
    
    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.applyFilters();
    });
    
    // Load initial data
    await this.loadAuditLogs();
  }

  async loadCustomers(): Promise<void> {
    try {
      // Replace with your actual customer service call
      // const customers = await firstValueFrom(this.customerService.getAllCustomers());
      
      // Mock data for now
      const customers: CustomerDto[] = [
        { companyId: 1, companyName: 'Acme Corporation' },
        { companyId: 2, companyName: 'Tech Solutions Ltd' },
        { companyId: 3, companyName: 'Global Industries' }
      ];
      
      this.customersCache = customers;
      this.customers$ = of(customers);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  }

  async loadUsers(): Promise<void> {
    try {
      // Replace with your actual user service call
      // const users = await firstValueFrom(this.userService.getAllUsers());
      
      // Mock data for now
      const users: UserDto[] = [
        { userId: 1, firstName: 'John', lastName: 'Doe' },
        { userId: 2, firstName: 'Jane', lastName: 'Smith' },
        { userId: 3, firstName: 'Admin', lastName: 'User' }
      ];
      
      this.usersCache = users;
      this.users$ = of(users);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async loadAuditLogs(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const filter: AuditLogFilterDto = {
      ...this.filterModel,
      pageNumber: this.currentPage(),
      pageSize: this.pageSize()
    };

    try {
      const result = await firstValueFrom(this.auditService.getAuditLogs(filter));
      
      this.auditLogs.set(result.items);
      this.totalCount.set(result.totalCount);
      this.currentPage.set(result.pageNumber);
      this.isLoading.set(false);
    } catch (error) {
      console.error('Error loading audit logs:', error);
      this.handleError(error);
      this.isLoading.set(false);
    }
  }

  // Row selection - opens details popup
  async selectAuditRow(audit: AuditLogDto): Promise<void> {
    this.selectedAudit.set(audit);
    this.showDetailsPopup.set(true);
    
    // Optional: Load additional details if needed
    // await this.loadAuditDetails(audit.auditId);
  }

  closeDetailsPopup(): void {
    this.showDetailsPopup.set(false);
    this.selectedAudit.set(null);
  }

  async onCustomerChange(): Promise<void> {
    if (this.selectedCustomerId) {
      this.filterModel.entityType = AuditEntityType.CUSTOMER;
      this.filterModel.entityId = this.selectedCustomerId;
    } else {
      this.filterModel.entityId = undefined;
    }
    await this.applyFilters();
  }

  async onFilterChange(): Promise<void> {
    this.currentPage.set(1);
    await this.applyFilters();
  }

  async onDateChange(): Promise<void> {
    if (this.startDateString) {
      this.filterModel.startDate = new Date(this.startDateString);
    } else {
      this.filterModel.startDate = undefined;
    }
    
    if (this.endDateString) {
      const endDate = new Date(this.endDateString);
      endDate.setHours(23, 59, 59, 999); // End of day
      this.filterModel.endDate = endDate;
    } else {
      this.filterModel.endDate = undefined;
    }
    
    this.currentPage.set(1);
    await this.applyFilters();
  }

  onSearchChange(): void {
    this.searchSubject.next(this.filterModel.searchTerm || '');
  }

  async applyFilters(): Promise<void> {
    this.currentPage.set(1);
    await this.loadAuditLogs();
  }

  async clearFilters(): Promise<void> {
    this.filterModel = {
      pageNumber: 1,
      pageSize: this.pageSize()
    };
    this.selectedCustomerId = null;
    this.startDateString = '';
    this.endDateString = '';
    this.currentPage.set(1);
    await this.loadAuditLogs();
  }

  async removeFilter(filterName: string): Promise<void> {
    switch (filterName) {
      case 'entityType':
        this.filterModel.entityType = undefined;
        break;
      case 'customer':
        this.selectedCustomerId = null;
        this.filterModel.entityId = undefined;
        break;
      case 'action':
        this.filterModel.action = undefined;
        break;
      case 'user':
        this.filterModel.performedBy = undefined;
        break;
      case 'startDate':
        this.startDateString = '';
        this.filterModel.startDate = undefined;
        break;
      case 'endDate':
        this.endDateString = '';
        this.filterModel.endDate = undefined;
        break;
      case 'searchTerm':
        this.filterModel.searchTerm = undefined;
        break;
    }
    await this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filterModel.entityType ||
      this.selectedCustomerId ||
      this.filterModel.action ||
      this.filterModel.performedBy ||
      this.startDateString ||
      this.endDateString ||
      this.filterModel.searchTerm
    );
  }

  toggleFilters(): void {
    this.showFilters.update(value => !value);
  }

  // Pagination
  async goToPage(page: number): Promise<void> {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) {
      return;
    }
    this.currentPage.set(page);
    await this.loadAuditLogs();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    const current = this.currentPage();
    const total = this.totalPages();
    
    let startPage = Math.max(1, current - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(total, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  async onPageSizeChange(): Promise<void> {
    this.filterModel.pageSize = this.pageSize();
    this.currentPage.set(1);
    await this.loadAuditLogs();
  }

  // Export functionality
  async exportAuditLogs(): Promise<void> {
    try {
      const csvContent = this.generateCSV();
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString()}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      alert('Failed to export audit logs');
    }
  }

  private generateCSV(): string {
    const headers = ['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'Entity Name', 'Changes', 'IP Address'];
    const rows = this.auditLogs().map(log => [
      this.formatDate(log.performedAt),
      log.performedByName,
      log.action,
      log.entityType,
      log.entityId.toString(),
      log.entityName || '',
      this.formatChangesForCSV(log.changes),
      log.ipAddress || ''
    ]);
    
    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  private formatChangesForCSV(changes: FieldChange[]): string {
    return changes.map(c => 
      `${c.fieldLabel}: ${c.oldValue} → ${c.newValue}`
    ).join('; ');
  }

  // Helper methods
  getCustomerName(customerId: number): string {
    const customer = this.customersCache.find(c => c.companyId === customerId);
    return customer?.companyName || `Customer #${customerId}`;
  }

  getUserName(userId: number): string {
    const user = this.usersCache.find(u => u.userId === userId);
    return user ? `${user.firstName} ${user.lastName}` : `User #${userId}`;
  }

  getActionIcon(action: AuditAction): string {
    switch (action) {
      case AuditAction.CREATE:
        return '➕';
      case AuditAction.UPDATE:
        return '✏️';
      case AuditAction.DELETE:
        return '🗑️';
      case AuditAction.VIEW:
        return '👁️';
      default:
        return '📝';
    }
  }

  getActionClass(action: AuditAction): string {
    switch (action) {
      case AuditAction.CREATE:
        return 'action-create';
      case AuditAction.UPDATE:
        return 'action-update';
      case AuditAction.DELETE:
        return 'action-delete';
      case AuditAction.VIEW:
        return 'action-view';
      default:
        return '';
    }
  }

  formatDate(date: Date): string {
    if (!this.isBrowser) {
      return '';
    }
    
    try {
      return new Date(date).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return String(date);
    }
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatValue(value: any, dataType: string): string {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }
    
    try {
      switch (dataType) {
        case 'date':
          if (!this.isBrowser) return String(value);
          return new Date(value).toLocaleDateString('en-GB');
        case 'boolean':
          return value ? 'Yes' : 'No';
        case 'object':
          return JSON.stringify(value, null, 2);
        default:
          return String(value);
      }
    } catch (error) {
      return String(value);
    }
  }

  hasChanges(audit: AuditLogDto): boolean {
    return audit.changes && audit.changes.length > 0;
  }

  private handleError(error: any): void {
    if (error.status === 400) {
      this.errorMessage.set('Invalid request parameters');
    } else if (error.status === 401) {
      this.errorMessage.set('Unauthorized - please log in');
    } else if (error.status === 404) {
      this.errorMessage.set('Audit logs not found');
    } else if (error.status === 0) {
      this.errorMessage.set('Unable to connect to server');
    } else {
      this.errorMessage.set('Failed to load audit logs');
    }
  }

  // TrackBy functions for performance
  trackByAuditId(index: number, audit: AuditLogDto): any {
    return audit.auditId || index;
  }

  trackByFieldName(index: number, change: FieldChange): string {
    return change.fieldName || index.toString();
  }
}