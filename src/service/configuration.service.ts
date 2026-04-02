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

export interface ArmConfig {
  armId: number;
  productId: number;
  description: string;
  price: number;
  armTypeId: number;
  bfId: number;
  dateCreated?: string;
  createdBy?: string;
}

export interface MotorConfig {
  motorId: number;
  productId: number;
  description: string;
  price: number;
  dateCreated?: string;
  createdBy?: string;
}

export interface HeaterConfig {
  heaterId: number;
  productId: number;
  description: string;
  price: number;
  priceNonRALColour: number;
  dateCreated?: string;
  createdBy?: string;
}

export interface NonStandardRALColourConfig {
  ralColourId: number;
  productId: number;
  widthCm: number;
  price: number;
  dateCreated?: string;
  createdBy?: string;
}

export interface ProjectionConfig {
  projectionId: number;
  productId: number;
  widthCm: number;
  projectionCm: number;
  price: number;
  armTypeId: number;
  dateCreated?: string;
  createdBy?: string;
}

export interface RadioControlledMotorConfig {
  radioMotorId: number;
  productId: number;
  description: string;
  widthCm: number;
  price: number;
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

  // ── Arms ──────────────────────────────────────────────────────────────────

  getArms(): Observable<ArmConfig[]> {
    return this.http.get<ArmConfig[]>(`${this.base}/api/configuration/arms`);
  }

  createArm(dto: Omit<ArmConfig, 'armId'>): Observable<ArmConfig> {
    return this.http.post<ArmConfig>(`${this.base}/api/configuration/arms`, dto);
  }

  updateArm(id: number, dto: ArmConfig): Observable<ArmConfig> {
    return this.http.put<ArmConfig>(`${this.base}/api/configuration/arms/${id}`, dto);
  }

  deleteArm(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/arms/${id}`);
  }

  // ── Motors ────────────────────────────────────────────────────────────────

  getMotors(): Observable<MotorConfig[]> {
    return this.http.get<MotorConfig[]>(`${this.base}/api/configuration/motors`);
  }

  createMotor(dto: Omit<MotorConfig, 'motorId'>): Observable<MotorConfig> {
    return this.http.post<MotorConfig>(`${this.base}/api/configuration/motors`, dto);
  }

  updateMotor(id: number, dto: MotorConfig): Observable<MotorConfig> {
    return this.http.put<MotorConfig>(`${this.base}/api/configuration/motors/${id}`, dto);
  }

  deleteMotor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/motors/${id}`);
  }

  // ── Heaters ───────────────────────────────────────────────────────────────

  getHeaters(): Observable<HeaterConfig[]> {
    return this.http.get<HeaterConfig[]>(`${this.base}/api/configuration/heaters`);
  }

  createHeater(dto: Omit<HeaterConfig, 'heaterId'>): Observable<HeaterConfig> {
    return this.http.post<HeaterConfig>(`${this.base}/api/configuration/heaters`, dto);
  }

  updateHeater(id: number, dto: HeaterConfig): Observable<HeaterConfig> {
    return this.http.put<HeaterConfig>(`${this.base}/api/configuration/heaters/${id}`, dto);
  }

  deleteHeater(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/heaters/${id}`);
  }

  // ── Non-Standard RAL Colours ──────────────────────────────────────────────

  getNonStandardRALColours(): Observable<NonStandardRALColourConfig[]> {
    return this.http.get<NonStandardRALColourConfig[]>(`${this.base}/api/configuration/ral-colours`);
  }

  createNonStandardRALColour(dto: Omit<NonStandardRALColourConfig, 'ralColourId'>): Observable<NonStandardRALColourConfig> {
    return this.http.post<NonStandardRALColourConfig>(`${this.base}/api/configuration/ral-colours`, dto);
  }

  updateNonStandardRALColour(id: number, dto: NonStandardRALColourConfig): Observable<NonStandardRALColourConfig> {
    return this.http.put<NonStandardRALColourConfig>(`${this.base}/api/configuration/ral-colours/${id}`, dto);
  }

  deleteNonStandardRALColour(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/ral-colours/${id}`);
  }

  // ── Projections ───────────────────────────────────────────────────────────

  getProjections(): Observable<ProjectionConfig[]> {
    return this.http.get<ProjectionConfig[]>(`${this.base}/api/configuration/projections`);
  }

  createProjection(dto: Omit<ProjectionConfig, 'projectionId'>): Observable<ProjectionConfig> {
    return this.http.post<ProjectionConfig>(`${this.base}/api/configuration/projections`, dto);
  }

  updateProjection(id: number, dto: ProjectionConfig): Observable<ProjectionConfig> {
    return this.http.put<ProjectionConfig>(`${this.base}/api/configuration/projections/${id}`, dto);
  }

  deleteProjection(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/projections/${id}`);
  }

  // ── Radio Controlled Motors ───────────────────────────────────────────────

  getRadioControlledMotors(): Observable<RadioControlledMotorConfig[]> {
    return this.http.get<RadioControlledMotorConfig[]>(`${this.base}/api/configuration/radio-motors`);
  }

  createRadioControlledMotor(dto: Omit<RadioControlledMotorConfig, 'radioMotorId'>): Observable<RadioControlledMotorConfig> {
    return this.http.post<RadioControlledMotorConfig>(`${this.base}/api/configuration/radio-motors`, dto);
  }

  updateRadioControlledMotor(id: number, dto: RadioControlledMotorConfig): Observable<RadioControlledMotorConfig> {
    return this.http.put<RadioControlledMotorConfig>(`${this.base}/api/configuration/radio-motors/${id}`, dto);
  }

  deleteRadioControlledMotor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/configuration/radio-motors/${id}`);
  }
}