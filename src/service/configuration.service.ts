import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../app/environments/environment';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface SiteVisitValue {
  id: number;
  category: string;
  value: string;
  displayOrder: number;
  isActive: boolean;
  dateCreated?: string;
  createdBy?: string;
}

export interface BracketConfig {
  bracketId: number;
  productId: number;
  bracketName: string;
  partNumber: string;
  price: number;
  dateCreated?: string;
  createdBy?: string;
}

export interface SupplierConfig {
  supplierId: number;
  supplierName: string;
  dateCreated?: string;
  createdBy?: string;
}

export interface ProductTypeConfig {
  productTypeId: number;
  supplierId: number;
  description: string;
  dateCreated?: string;
  createdBy?: string;
}

export interface ProductConfig {
  productId: number;
  description: string;
  productTypeId: number;
  supplierId: number;
  dateCreated?: string;
  createdBy?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ConfigurationService {

  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── SiteVisitValues ──────────────────────────────────────────────────────

  getSiteVisitValues(): Observable<SiteVisitValue[]> {
    return this.http.get<SiteVisitValue[]>(`${this.base}/api/configuration/site-visit-values`);
  }

  createSiteVisitValue(dto: Omit<SiteVisitValue, 'id'>): Observable<SiteVisitValue> {
    return this.http.post<SiteVisitValue>(`${this.base}/api/configuration/site-visit-values`, dto);
  }

  updateSiteVisitValue(id: number, dto: SiteVisitValue): Observable<SiteVisitValue> {
    return this.http.put<SiteVisitValue>(`${this.base}/api/configuration/site-visit-values/${id}`, dto);
  }

  deleteSiteVisitValue(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/site-visit-values/${id}`);
  }

  // ── Brackets ─────────────────────────────────────────────────────────────

  getBrackets(): Observable<BracketConfig[]> {
    return this.http.get<BracketConfig[]>(`${this.base}/api/configuration/brackets`);
  }

  createBracket(dto: Omit<BracketConfig, 'bracketId'>): Observable<BracketConfig> {
    return this.http.post<BracketConfig>(`${this.base}/api/configuration/brackets`, dto);
  }

  updateBracket(id: number, dto: BracketConfig): Observable<BracketConfig> {
    return this.http.put<BracketConfig>(`${this.base}/api/configuration/brackets/${id}`, dto);
  }

  deleteBracket(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/brackets/${id}`);
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  getSuppliers(): Observable<SupplierConfig[]> {
    return this.http.get<SupplierConfig[]>(`${this.base}/api/configuration/suppliers`);
  }

  createSupplier(dto: Omit<SupplierConfig, 'supplierId'>): Observable<SupplierConfig> {
    return this.http.post<SupplierConfig>(`${this.base}/api/configuration/suppliers`, dto);
  }

  updateSupplier(id: number, dto: SupplierConfig): Observable<SupplierConfig> {
    return this.http.put<SupplierConfig>(`${this.base}/api/configuration/suppliers/${id}`, dto);
  }

  deleteSupplier(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/suppliers/${id}`);
  }

  // ── ProductTypes ──────────────────────────────────────────────────────────

  getProductTypes(): Observable<ProductTypeConfig[]> {
    return this.http.get<ProductTypeConfig[]>(`${this.base}/api/configuration/product-types`);
  }

  createProductType(dto: Omit<ProductTypeConfig, 'productTypeId'>): Observable<ProductTypeConfig> {
    return this.http.post<ProductTypeConfig>(`${this.base}/api/configuration/product-types`, dto);
  }

  updateProductType(id: number, dto: ProductTypeConfig): Observable<ProductTypeConfig> {
    return this.http.put<ProductTypeConfig>(`${this.base}/api/configuration/product-types/${id}`, dto);
  }

  deleteProductType(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/product-types/${id}`);
  }

  // ── Products ──────────────────────────────────────────────────────────────

  getProducts(): Observable<ProductConfig[]> {
    return this.http.get<ProductConfig[]>(`${this.base}/api/configuration/products`);
  }

  createProduct(dto: Omit<ProductConfig, 'productId'>): Observable<ProductConfig> {
    return this.http.post<ProductConfig>(`${this.base}/api/configuration/products`, dto);
  }

  updateProduct(id: number, dto: ProductConfig): Observable<ProductConfig> {
    return this.http.put<ProductConfig>(`${this.base}/api/configuration/products/${id}`, dto);
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/products/${id}`);
  }
}