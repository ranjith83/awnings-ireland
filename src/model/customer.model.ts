export interface Customer {
  id?: number;
  companyName: string;
  contact: string;
  mobile: string;
  email: string;
  siteAddress: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Optional: If you need a class with methods
export class CustomerModel implements Customer {
  id?: number;
  companyName: string;
  contact: string;
  mobile: string;
  email: string;
  siteAddress: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(data?: Partial<Customer>) {
    this.id = data?.id;
    this.companyName = data?.companyName || '';
    this.contact = data?.contact || '';
    this.mobile = data?.mobile || '';
    this.email = data?.email || '';
    this.siteAddress = data?.siteAddress || '';
    this.createdAt = data?.createdAt;
    this.updatedAt = data?.updatedAt;
  }

  // Method to validate email format
  isValidEmail(): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(this.email);
  }

  // Method to validate mobile format
  isValidMobile(): boolean {
    const mobileRegex = /^\d{9,15}$/;
    return mobileRegex.test(this.mobile);
  }

  // Method to get full display name
  getDisplayName(): string {
    return `${this.contact} - ${this.companyName}`;
  }

  // Method to convert to JSON
  toJSON(): Customer {
    return {
      id: this.id,
      companyName: this.companyName,
      contact: this.contact,
      mobile: this.mobile,
      email: this.email,
      siteAddress: this.siteAddress,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// Optional: DTO for creating new customers
export interface CreateCustomerDto {
  companyName: string;
  contact: string;
  mobile: string;
  email: string;
  siteAddress: string;
}

// Optional: DTO for updating customers
export interface UpdateCustomerDto {
  companyName?: string;
  contact?: string;
  mobile?: string;
  email?: string;
  siteAddress?: string;
}

// Search/Filter interface - REQUIRED for component
export interface CustomerSearchFilters {
  companyName: string;
  contact: string;
  mobile: string;
  email: string;
  siteAddress: string;
}

// Optional: Pagination interface
export interface CustomerListResponse {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
}