import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, forkJoin, of } from 'rxjs';
import { takeUntil, finalize, catchError, map, shareReplay, tap } from 'rxjs/operators';

import {
  ConfigurationService,
  SiteVisitValue,
  BracketConfig,
  SupplierConfig,
  ProductTypeConfig,
  ProductConfig,
  ArmConfig,
  MotorConfig,
  HeaterConfig,
  NonStandardRALColourConfig,
  ProjectionConfig,
  RadioControlledMotorConfig
} from '../../service/configuration.service';

export type ConfigTab =
  | 'siteVisit' | 'brackets' | 'suppliers' | 'productTypes' | 'products'
  | 'arms' | 'motors' | 'heaters' | 'ralColours' | 'projections' | 'radioMotors';

interface DeleteTarget {
  type: ConfigTab;
  id: number;
  label: string;
}

import { NotificationService } from '../../service/notification.service';
@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuration.component.html',
  styleUrl: './configuration.component.scss'
})
export class ConfigurationComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // ── Tab state ─────────────────────────────────────────────────────────────────
  tabs: { id: ConfigTab; label: string; icon: string }[] = [
    { id: 'siteVisit',    label: 'Site Visit Values',       icon: '🗂️' },
    { id: 'brackets',     label: 'Brackets',                icon: '🔩' },
    { id: 'suppliers',    label: 'Suppliers',               icon: '🏭' },
    { id: 'productTypes', label: 'Product Types',           icon: '📦' },
    { id: 'products',     label: 'Products',                icon: '🛠️' },
    { id: 'arms',         label: 'Arms',                    icon: '💪' },
    { id: 'motors',       label: 'Motors',                  icon: '⚙️' },
    { id: 'heaters',      label: 'Heaters',                 icon: '🔥' },
    { id: 'ralColours',   label: 'Non-Standard RAL Colours',icon: '🎨' },
    { id: 'projections',  label: 'Projections',             icon: '📐' },
    { id: 'radioMotors',  label: 'Radio Motors',            icon: '📡' },
  ];

  // ── UI state subjects ─────────────────────────────────────────────────────────
  private activeTabSubject      = new BehaviorSubject<ConfigTab>('siteVisit');
  private isLoadingSubject      = new BehaviorSubject<boolean>(false);
  private isSavingSubject       = new BehaviorSubject<boolean>(false);
  private isDeletingSubject     = new BehaviorSubject<boolean>(false);
  private successMessageSubject = new BehaviorSubject<string>('');
  private errorMessageSubject   = new BehaviorSubject<string>('');

  activeTab$      = this.activeTabSubject.asObservable();
  isLoading$      = this.isLoadingSubject.asObservable();
  isSaving$       = this.isSavingSubject.asObservable();
  isDeleting$     = this.isDeletingSubject.asObservable();
  successMessage$ = this.successMessageSubject.asObservable();
  errorMessage$   = this.errorMessageSubject.asObservable();

  // ── Modal state ───────────────────────────────────────────────────────────────
  showDeleteModal = false;
  showEditModal   = false;
  deleteTarget: DeleteTarget | null = null;

  // ── Existing data subjects ────────────────────────────────────────────────────
  private svSubject$           = new BehaviorSubject<SiteVisitValue[]>([]);
  private svCategoriesSubject$ = new BehaviorSubject<string[]>([]);
  private svFilterSubject$     = new BehaviorSubject<string>('');

  private bracketsSubject$        = new BehaviorSubject<BracketConfig[]>([]);
  private bracketProductsSubject$ = new BehaviorSubject<{ productId: number; label: string }[]>([]);
  private bracketFilterSubject$   = new BehaviorSubject<number | ''>('');

  private suppliersSubject$    = new BehaviorSubject<SupplierConfig[]>([]);
  private productTypesSubject$ = new BehaviorSubject<ProductTypeConfig[]>([]);
  private ptFilterSubject$     = new BehaviorSubject<number | ''>('');

  private productsSubject$         = new BehaviorSubject<ProductConfig[]>([]);
  private prodFilterSubject$       = new BehaviorSubject<number | ''>('');
  private newProdSupplierSubject$  = new BehaviorSubject<number>(0);
  private editProdSupplierSubject$ = new BehaviorSubject<number>(0);

  // ── New data subjects ─────────────────────────────────────────────────────────
  private armsSubject$        = new BehaviorSubject<ArmConfig[]>([]);
  private armFilterSubject$   = new BehaviorSubject<number | ''>('');

  private motorsSubject$      = new BehaviorSubject<MotorConfig[]>([]);
  private motorFilterSubject$ = new BehaviorSubject<number | ''>('');

  private heatersSubject$      = new BehaviorSubject<HeaterConfig[]>([]);
  private heaterFilterSubject$ = new BehaviorSubject<number | ''>('');

  private ralColoursSubject$      = new BehaviorSubject<NonStandardRALColourConfig[]>([]);
  private ralColourFilterSubject$ = new BehaviorSubject<number | ''>('');

  private projectionsSubject$      = new BehaviorSubject<ProjectionConfig[]>([]);
  private projectionFilterSubject$ = new BehaviorSubject<number | ''>('');

  private radioMotorsSubject$      = new BehaviorSubject<RadioControlledMotorConfig[]>([]);
  private radioMotorFilterSubject$ = new BehaviorSubject<number | ''>('');

  // Shared product list for all product-scoped tabs
  private allProductsSubject$ = new BehaviorSubject<{ productId: number; label: string }[]>([]);
  allProducts$: Observable<{ productId: number; label: string }[]> = this.allProductsSubject$.asObservable();

  // ── Derived observables ───────────────────────────────────────────────────────
  svCategories$: Observable<string[]> = this.svCategoriesSubject$.asObservable();

  filteredSiteVisitValues$: Observable<SiteVisitValue[]> = combineLatest([
    this.svSubject$, this.svFilterSubject$
  ]).pipe(
    map(([values, cat]) => cat ? values.filter(v => v.category === cat) : values),
    shareReplay(1)
  );

  filteredBrackets$: Observable<BracketConfig[]> = combineLatest([
    this.bracketsSubject$, this.bracketFilterSubject$
  ]).pipe(
    map(([brackets, pid]) => pid === '' ? brackets : brackets.filter(b => b.productId === pid)),
    shareReplay(1)
  );

  bracketProducts$: Observable<{ productId: number; label: string }[]> =
    this.bracketProductsSubject$.asObservable();

  suppliers$: Observable<SupplierConfig[]> = this.suppliersSubject$.asObservable();

  filteredProductTypes$: Observable<ProductTypeConfig[]> = combineLatest([
    this.productTypesSubject$, this.ptFilterSubject$
  ]).pipe(
    map(([types, sid]) => sid === '' ? types : types.filter(pt => pt.supplierId === sid)),
    shareReplay(1)
  );

  filteredProducts$: Observable<ProductConfig[]> = combineLatest([
    this.productsSubject$, this.prodFilterSubject$
  ]).pipe(
    map(([products, sid]) => sid === '' ? products : products.filter(p => p.supplierId === sid)),
    shareReplay(1)
  );

  filteredProductTypesForNew$: Observable<ProductTypeConfig[]> = combineLatest([
    this.productTypesSubject$, this.newProdSupplierSubject$
  ]).pipe(
    map(([types, sid]) => sid ? types.filter(pt => pt.supplierId === sid) : types),
    shareReplay(1)
  );

  filteredProductTypesForEdit$: Observable<ProductTypeConfig[]> = combineLatest([
    this.productTypesSubject$, this.editProdSupplierSubject$
  ]).pipe(
    map(([types, sid]) => sid ? types.filter(pt => pt.supplierId === sid) : types),
    shareReplay(1)
  );

  filteredArms$: Observable<ArmConfig[]> = combineLatest([
    this.armsSubject$, this.armFilterSubject$
  ]).pipe(
    map(([arms, pid]) => pid === '' ? arms : arms.filter(a => a.productId === pid)),
    shareReplay(1)
  );

  filteredMotors$: Observable<MotorConfig[]> = combineLatest([
    this.motorsSubject$, this.motorFilterSubject$
  ]).pipe(
    map(([motors, pid]) => pid === '' ? motors : motors.filter(m => m.productId === pid)),
    shareReplay(1)
  );

  filteredHeaters$: Observable<HeaterConfig[]> = combineLatest([
    this.heatersSubject$, this.heaterFilterSubject$
  ]).pipe(
    map(([heaters, pid]) => pid === '' ? heaters : heaters.filter(h => h.productId === pid)),
    shareReplay(1)
  );

  filteredRalColours$: Observable<NonStandardRALColourConfig[]> = combineLatest([
    this.ralColoursSubject$, this.ralColourFilterSubject$
  ]).pipe(
    map(([colours, pid]) => pid === '' ? colours : colours.filter(c => c.productId === pid)),
    shareReplay(1)
  );

  filteredProjections$: Observable<ProjectionConfig[]> = combineLatest([
    this.projectionsSubject$, this.projectionFilterSubject$
  ]).pipe(
    map(([proj, pid]) => pid === '' ? proj : proj.filter(p => p.productId === pid)),
    shareReplay(1)
  );

  filteredRadioMotors$: Observable<RadioControlledMotorConfig[]> = combineLatest([
    this.radioMotorsSubject$, this.radioMotorFilterSubject$
  ]).pipe(
    map(([motors, pid]) => pid === '' ? motors : motors.filter(m => m.productId === pid)),
    shareReplay(1)
  );

  // ── Form models ───────────────────────────────────────────────────────────────
  newSv: Partial<SiteVisitValue>   = { category: '', value: '', displayOrder: 1, isActive: true };
  editingSv: SiteVisitValue | null = null;

  newBracket: Partial<BracketConfig>   = { productId: 0, bracketName: '', partNumber: '', price: 0 };
  editingBracket: BracketConfig | null = null;

  newSupplier: Partial<SupplierConfig>     = { supplierName: '' };
  editingSupplier: SupplierConfig | null   = null;

  newPt: Partial<ProductTypeConfig>   = { supplierId: 0, description: '' };
  editingPt: ProductTypeConfig | null = null;

  newProd: Partial<ProductConfig>   = { supplierId: 0, productTypeId: 0, description: '' };
  editingProd: ProductConfig | null = null;

  newArm: Partial<ArmConfig>   = { productId: 0, description: '', price: 0, armTypeId: 0, bfId: 0 };
  editingArm: ArmConfig | null = null;

  newMotor: Partial<MotorConfig>   = { productId: 0, description: '', price: 0 };
  editingMotor: MotorConfig | null = null;

  newHeater: Partial<HeaterConfig>   = { productId: 0, description: '', price: 0, priceNonRALColour: 0 };
  editingHeater: HeaterConfig | null = null;

  newRalColour: Partial<NonStandardRALColourConfig>   = { productId: 0, widthCm: 0, price: 0 };
  editingRalColour: NonStandardRALColourConfig | null = null;

  newProjection: Partial<ProjectionConfig>   = { productId: 0, widthCm: 0, projectionCm: 0, price: 0, armTypeId: 0 };
  editingProjection: ProjectionConfig | null = null;

  newRadioMotor: Partial<RadioControlledMotorConfig>   = { productId: 0, description: '', widthCm: 0, price: 0 };
  editingRadioMotor: RadioControlledMotorConfig | null = null;

  // ── Filter getters/setters ────────────────────────────────────────────────────
  get svFilterCategory(): string           { return this.svFilterSubject$.value; }
  set svFilterCategory(v: string)          { this.svFilterSubject$.next(v); }

  get bracketFilterProduct(): number | ''  { return this.bracketFilterSubject$.value; }
  set bracketFilterProduct(v: number | '') { this.bracketFilterSubject$.next(v); }

  get ptFilterSupplier(): number | ''      { return this.ptFilterSubject$.value; }
  set ptFilterSupplier(v: number | '')     { this.ptFilterSubject$.next(v); }

  get prodFilterSupplier(): number | ''    { return this.prodFilterSubject$.value; }
  set prodFilterSupplier(v: number | '')   { this.prodFilterSubject$.next(v); }

  get armFilterProduct(): number | ''      { return this.armFilterSubject$.value; }
  set armFilterProduct(v: number | '')     { this.armFilterSubject$.next(v); }

  get motorFilterProduct(): number | ''    { return this.motorFilterSubject$.value; }
  set motorFilterProduct(v: number | '')   { this.motorFilterSubject$.next(v); }

  get heaterFilterProduct(): number | ''   { return this.heaterFilterSubject$.value; }
  set heaterFilterProduct(v: number | '')  { this.heaterFilterSubject$.next(v); }

  get ralColourFilterProduct(): number | ''  { return this.ralColourFilterSubject$.value; }
  set ralColourFilterProduct(v: number | '') { this.ralColourFilterSubject$.next(v); }

  get projectionFilterProduct(): number | ''  { return this.projectionFilterSubject$.value; }
  set projectionFilterProduct(v: number | '') { this.projectionFilterSubject$.next(v); }

  get radioMotorFilterProduct(): number | ''  { return this.radioMotorFilterSubject$.value; }
  set radioMotorFilterProduct(v: number | '') { this.radioMotorFilterSubject$.next(v); }

  get activeTab(): ConfigTab { return this.activeTabSubject.value; }

  get activeTabLabel(): string {
    return this.tabs.find(t => t.id === this.activeTabSubject.value)?.label ?? '';
  }

  constructor(private configService: ConfigurationService,
    private notificationService: NotificationService) {}

  ngOnInit(): void {
    this.loadActiveTab();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Tab switching ─────────────────────────────────────────────────────────────

  switchTab(tab: ConfigTab): void {
    this.activeTabSubject.next(tab);
    this.clearMessages();
    this.closeEditModal();
    this.loadActiveTab();
  }

  private loadActiveTab(): void {
    switch (this.activeTabSubject.value) {
      case 'siteVisit':    this.loadSiteVisitValues();          break;
      case 'brackets':     this.loadBracketsAndProducts();      break;
      case 'suppliers':    this.loadSuppliers();                break;
      case 'productTypes': this.loadProductTypesAndSuppliers(); break;
      case 'products':     this.loadProductsAndDeps();          break;
      case 'arms':         this.loadArmsAndProducts();          break;
      case 'motors':       this.loadMotorsAndProducts();        break;
      case 'heaters':      this.loadHeatersAndProducts();       break;
      case 'ralColours':   this.loadRalColoursAndProducts();    break;
      case 'projections':  this.loadProjectionsAndProducts();   break;
      case 'radioMotors':  this.loadRadioMotorsAndProducts();   break;
    }
  }

  // ── Helper: load products into shared allProducts$ subject ────────────────────
  private loadAllProductsInto(cb: () => void): void {
    if (this.allProductsSubject$.value.length > 0) { cb(); return; }
    this.configService.getProducts().pipe(
      takeUntil(this.destroy$),
      catchError(() => of([] as ProductConfig[]))
    ).subscribe(products => {
      this.allProductsSubject$.next(
        products.map(p => ({ productId: p.productId, label: p.description }))
          .sort((a, b) => a.label.localeCompare(b.label)));
      cb();
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  SITE VISIT VALUES
  // ═════════════════════════════════════════════════════════════════════════════

  loadSiteVisitValues(): void {
    this.isLoadingSubject.next(true);
    this.configService.getSiteVisitValues().pipe(
      takeUntil(this.destroy$),
      tap(data => {
        const sorted = [...data].sort((a, b) =>
          a.category.localeCompare(b.category) || a.displayOrder - b.displayOrder);
        this.svSubject$.next(sorted);
        this.svCategoriesSubject$.next([...new Set(data.map(v => v.category))].sort());
        this.isLoadingSubject.next(false);
      }),
      catchError(() => {
        this.errorMessageSubject.next('Failed to load site visit values.');
        this.isLoadingSubject.next(false);
        return of([]);
      })
    ).subscribe();
  }

  addSiteVisitValue(): void {
    if (!this.newSv.category?.trim() || !this.newSv.value?.trim()) {
      this.errorMessageSubject.next('Category and Value are required.'); return;
    }
    this.isSavingSubject.next(true);
    this.configService.createSiteVisitValue(this.newSv as Omit<SiteVisitValue, 'id'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Site visit value added.'); this.newSv = { category: '', value: '', displayOrder: 1, isActive: true }; this.loadSiteVisitValues(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add site visit value.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditSv(sv: SiteVisitValue): void { this.editingSv = { ...sv }; this.showEditModal = true; }

  saveEditSv(): void {
    if (!this.editingSv) return;
    this.isSavingSubject.next(true);
    this.configService.updateSiteVisitValue(this.editingSv.id, this.editingSv).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Site visit value updated.'); this.closeEditModal(); this.loadSiteVisitValues(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update site visit value.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteSv(sv: SiteVisitValue): void {
    this.deleteTarget = { type: 'siteVisit', id: sv.id, label: `${sv.category} → ${sv.value}` };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  BRACKETS
  // ═════════════════════════════════════════════════════════════════════════════

  loadBracketsAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      brackets: this.configService.getBrackets().pipe(catchError(() => of([] as BracketConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ brackets, products }) => {
        this.bracketsSubject$.next([...brackets].sort((a, b) => a.productId - b.productId || a.bracketName.localeCompare(b.bracketName)));
        this.bracketProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load brackets.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  getProductLabel(productId: number): string {
    return this.allProductsSubject$.value.find(p => p.productId === productId)?.label
        ?? this.bracketProductsSubject$.value.find(p => p.productId === productId)?.label
        ?? `Product ${productId}`;
  }

  addBracket(): void {
    if (!this.newBracket.bracketName?.trim() || !this.newBracket.productId) {
      this.errorMessageSubject.next('Bracket name and product are required.'); return;
    }
    this.isSavingSubject.next(true);
    this.configService.createBracket(this.newBracket as Omit<BracketConfig, 'bracketId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Bracket added.'); this.newBracket = { productId: 0, bracketName: '', partNumber: '', price: 0 }; this.loadBracketsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add bracket.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditBracket(b: BracketConfig): void { this.editingBracket = { ...b }; this.showEditModal = true; }

  saveEditBracket(): void {
    if (!this.editingBracket) return;
    this.isSavingSubject.next(true);
    this.configService.updateBracket(this.editingBracket.bracketId, this.editingBracket).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Bracket updated.'); this.closeEditModal(); this.loadBracketsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update bracket.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteBracket(b: BracketConfig): void {
    this.deleteTarget = { type: 'brackets', id: b.bracketId, label: b.bracketName };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  SUPPLIERS
  // ═════════════════════════════════════════════════════════════════════════════

  loadSuppliers(): void {
    this.isLoadingSubject.next(true);
    this.configService.getSuppliers().pipe(
      takeUntil(this.destroy$),
      tap(data => { this.suppliersSubject$.next([...data].sort((a, b) => a.supplierName.localeCompare(b.supplierName))); this.isLoadingSubject.next(false); }),
      catchError(() => { this.errorMessageSubject.next('Failed to load suppliers.'); this.isLoadingSubject.next(false); return of([]); })
    ).subscribe();
  }

  getSupplierName(id: number): string {
    return this.suppliersSubject$.value.find(s => s.supplierId === id)?.supplierName ?? `Supplier ${id}`;
  }

  addSupplier(): void {
    if (!this.newSupplier.supplierName?.trim()) { this.errorMessageSubject.next('Supplier name is required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createSupplier(this.newSupplier as Omit<SupplierConfig, 'supplierId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Supplier added.'); this.newSupplier = { supplierName: '' }; this.loadSuppliers(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add supplier.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditSupplier(s: SupplierConfig): void { this.editingSupplier = { ...s }; this.showEditModal = true; }

  saveEditSupplier(): void {
    if (!this.editingSupplier) return;
    this.isSavingSubject.next(true);
    this.configService.updateSupplier(this.editingSupplier.supplierId, this.editingSupplier).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Supplier updated.'); this.closeEditModal(); this.loadSuppliers(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update supplier.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteSupplier(s: SupplierConfig): void {
    this.deleteTarget = { type: 'suppliers', id: s.supplierId, label: s.supplierName };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  PRODUCT TYPES
  // ═════════════════════════════════════════════════════════════════════════════

  loadProductTypesAndSuppliers(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      types:     this.configService.getProductTypes().pipe(catchError(() => of([] as ProductTypeConfig[]))),
      suppliers: this.configService.getSuppliers().pipe(catchError(() => of([] as SupplierConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ types, suppliers }) => {
        this.productTypesSubject$.next([...types].sort((a, b) => a.supplierId - b.supplierId || a.description.localeCompare(b.description)));
        this.suppliersSubject$.next([...suppliers].sort((a, b) => a.supplierName.localeCompare(b.supplierName)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load product types.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  getProductTypeName(id: number): string {
    return this.productTypesSubject$.value.find(pt => pt.productTypeId === id)?.description ?? `Type ${id}`;
  }

  addProductType(): void {
    if (!this.newPt.description?.trim() || !this.newPt.supplierId) { this.errorMessageSubject.next('Description and supplier are required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createProductType(this.newPt as Omit<ProductTypeConfig, 'productTypeId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Product type added.'); this.newPt = { supplierId: 0, description: '' }; this.loadProductTypesAndSuppliers(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add product type.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditPt(pt: ProductTypeConfig): void { this.editingPt = { ...pt }; this.showEditModal = true; }

  saveEditPt(): void {
    if (!this.editingPt) return;
    this.isSavingSubject.next(true);
    this.configService.updateProductType(this.editingPt.productTypeId, this.editingPt).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Product type updated.'); this.closeEditModal(); this.loadProductTypesAndSuppliers(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update product type.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeletePt(pt: ProductTypeConfig): void {
    this.deleteTarget = { type: 'productTypes', id: pt.productTypeId, label: pt.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  PRODUCTS
  // ═════════════════════════════════════════════════════════════════════════════

  loadProductsAndDeps(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      products:     this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[]))),
      suppliers:    this.configService.getSuppliers().pipe(catchError(() => of([] as SupplierConfig[]))),
      productTypes: this.configService.getProductTypes().pipe(catchError(() => of([] as ProductTypeConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ products, suppliers, productTypes }) => {
        this.productsSubject$.next([...products].sort((a, b) => a.description.localeCompare(b.description)));
        this.suppliersSubject$.next([...suppliers].sort((a, b) => a.supplierName.localeCompare(b.supplierName)));
        this.productTypesSubject$.next([...productTypes]);
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load products.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  onNewProdSupplierChange(): void { this.newProd.productTypeId = 0; this.newProdSupplierSubject$.next(this.newProd.supplierId ?? 0); }
  onEditProdSupplierChange(): void { if (this.editingProd) { this.editingProd.productTypeId = 0; this.editProdSupplierSubject$.next(this.editingProd.supplierId); } }

  addProduct(): void {
    if (!this.newProd.description?.trim() || !this.newProd.supplierId || !this.newProd.productTypeId) {
      this.errorMessageSubject.next('Description, supplier, and product type are required.'); return;
    }
    this.isSavingSubject.next(true);
    this.configService.createProduct(this.newProd as Omit<ProductConfig, 'productId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Product added.'); this.newProd = { supplierId: 0, productTypeId: 0, description: '' }; this.loadProductsAndDeps(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add product.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditProd(p: ProductConfig): void { this.editingProd = { ...p }; this.editProdSupplierSubject$.next(p.supplierId); this.showEditModal = true; }

  saveEditProd(): void {
    if (!this.editingProd) return;
    this.isSavingSubject.next(true);
    this.configService.updateProduct(this.editingProd.productId, this.editingProd).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Product updated.'); this.closeEditModal(); this.loadProductsAndDeps(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update product.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteProd(p: ProductConfig): void {
    this.deleteTarget = { type: 'products', id: p.productId, label: p.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  ARMS
  // ═════════════════════════════════════════════════════════════════════════════

  loadArmsAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      arms:     this.configService.getArms().pipe(catchError(() => of([] as ArmConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ arms, products }) => {
        this.armsSubject$.next([...arms].sort((a, b) => a.productId - b.productId || a.description.localeCompare(b.description)));
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load arms.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  addArm(): void {
    if (!this.newArm.description?.trim() || !this.newArm.productId) { this.errorMessageSubject.next('Description and product are required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createArm(this.newArm as Omit<ArmConfig, 'armId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Arm added.'); this.newArm = { productId: 0, description: '', price: 0, armTypeId: 0, bfId: 0 }; this.loadArmsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add arm.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditArm(a: ArmConfig): void { this.editingArm = { ...a }; this.showEditModal = true; }

  saveEditArm(): void {
    if (!this.editingArm) return;
    this.isSavingSubject.next(true);
    this.configService.updateArm(this.editingArm.armId, this.editingArm).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Arm updated.'); this.closeEditModal(); this.loadArmsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update arm.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteArm(a: ArmConfig): void {
    this.deleteTarget = { type: 'arms', id: a.armId, label: a.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  MOTORS
  // ═════════════════════════════════════════════════════════════════════════════

  loadMotorsAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      motors:   this.configService.getMotors().pipe(catchError(() => of([] as MotorConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ motors, products }) => {
        this.motorsSubject$.next([...motors].sort((a, b) => a.productId - b.productId || a.description.localeCompare(b.description)));
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load motors.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  addMotor(): void {
    if (!this.newMotor.description?.trim() || !this.newMotor.productId) { this.errorMessageSubject.next('Description and product are required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createMotor(this.newMotor as Omit<MotorConfig, 'motorId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Motor added.'); this.newMotor = { productId: 0, description: '', price: 0 }; this.loadMotorsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add motor.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditMotor(m: MotorConfig): void { this.editingMotor = { ...m }; this.showEditModal = true; }

  saveEditMotor(): void {
    if (!this.editingMotor) return;
    this.isSavingSubject.next(true);
    this.configService.updateMotor(this.editingMotor.motorId, this.editingMotor).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Motor updated.'); this.closeEditModal(); this.loadMotorsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update motor.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteMotor(m: MotorConfig): void {
    this.deleteTarget = { type: 'motors', id: m.motorId, label: m.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  HEATERS
  // ═════════════════════════════════════════════════════════════════════════════

  loadHeatersAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      heaters:  this.configService.getHeaters().pipe(catchError(() => of([] as HeaterConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ heaters, products }) => {
        this.heatersSubject$.next([...heaters].sort((a, b) => a.productId - b.productId || a.description.localeCompare(b.description)));
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load heaters.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  addHeater(): void {
    if (!this.newHeater.description?.trim() || !this.newHeater.productId) { this.errorMessageSubject.next('Description and product are required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createHeater(this.newHeater as Omit<HeaterConfig, 'heaterId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Heater added.'); this.newHeater = { productId: 0, description: '', price: 0, priceNonRALColour: 0 }; this.loadHeatersAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add heater.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditHeater(h: HeaterConfig): void { this.editingHeater = { ...h }; this.showEditModal = true; }

  saveEditHeater(): void {
    if (!this.editingHeater) return;
    this.isSavingSubject.next(true);
    this.configService.updateHeater(this.editingHeater.heaterId, this.editingHeater).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Heater updated.'); this.closeEditModal(); this.loadHeatersAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update heater.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteHeater(h: HeaterConfig): void {
    this.deleteTarget = { type: 'heaters', id: h.heaterId, label: h.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  NON-STANDARD RAL COLOURS
  // ═════════════════════════════════════════════════════════════════════════════

  loadRalColoursAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      colours:  this.configService.getNonStandardRALColours().pipe(catchError(() => of([] as NonStandardRALColourConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ colours, products }) => {
        this.ralColoursSubject$.next([...colours].sort((a, b) => a.productId - b.productId || a.widthCm - b.widthCm));
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load RAL colours.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  addRalColour(): void {
    if (!this.newRalColour.productId || !this.newRalColour.widthCm) { this.errorMessageSubject.next('Product and width are required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createNonStandardRALColour(this.newRalColour as Omit<NonStandardRALColourConfig, 'ralColourId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('RAL colour entry added.'); this.newRalColour = { productId: 0, widthCm: 0, price: 0 }; this.loadRalColoursAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add RAL colour entry.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditRalColour(c: NonStandardRALColourConfig): void { this.editingRalColour = { ...c }; this.showEditModal = true; }

  saveEditRalColour(): void {
    if (!this.editingRalColour) return;
    this.isSavingSubject.next(true);
    this.configService.updateNonStandardRALColour(this.editingRalColour.ralColourId, this.editingRalColour).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('RAL colour entry updated.'); this.closeEditModal(); this.loadRalColoursAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update RAL colour entry.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteRalColour(c: NonStandardRALColourConfig): void {
    this.deleteTarget = { type: 'ralColours', id: c.ralColourId, label: `Product ${c.productId} — ${c.widthCm}cm` };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  PROJECTIONS
  // ═════════════════════════════════════════════════════════════════════════════

  loadProjectionsAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      projections: this.configService.getProjections().pipe(catchError(() => of([] as ProjectionConfig[]))),
      products:    this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ projections, products }) => {
        this.projectionsSubject$.next([...projections].sort((a, b) => a.productId - b.productId || a.widthCm - b.widthCm || a.projectionCm - b.projectionCm));
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load projections.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  addProjection(): void {
    if (!this.newProjection.productId || !this.newProjection.widthCm || !this.newProjection.projectionCm) {
      this.errorMessageSubject.next('Product, width and projection are required.'); return;
    }
    this.isSavingSubject.next(true);
    this.configService.createProjection(this.newProjection as Omit<ProjectionConfig, 'projectionId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Projection added.'); this.newProjection = { productId: 0, widthCm: 0, projectionCm: 0, price: 0, armTypeId: 0 }; this.loadProjectionsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add projection.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditProjection(p: ProjectionConfig): void { this.editingProjection = { ...p }; this.showEditModal = true; }

  saveEditProjection(): void {
    if (!this.editingProjection) return;
    this.isSavingSubject.next(true);
    this.configService.updateProjection(this.editingProjection.projectionId, this.editingProjection).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Projection updated.'); this.closeEditModal(); this.loadProjectionsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update projection.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteProjection(p: ProjectionConfig): void {
    this.deleteTarget = { type: 'projections', id: p.projectionId, label: `${this.getProductLabel(p.productId)} — W:${p.widthCm}cm P:${p.projectionCm}cm` };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  RADIO CONTROLLED MOTORS
  // ═════════════════════════════════════════════════════════════════════════════

  loadRadioMotorsAndProducts(): void {
    this.isLoadingSubject.next(true);
    forkJoin({
      motors:   this.configService.getRadioControlledMotors().pipe(catchError(() => of([] as RadioControlledMotorConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ motors, products }) => {
        this.radioMotorsSubject$.next([...motors].sort((a, b) => a.productId - b.productId || a.description.localeCompare(b.description)));
        this.allProductsSubject$.next(products.map(p => ({ productId: p.productId, label: p.description })).sort((a, b) => a.label.localeCompare(b.label)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to load radio motors.'); this.isLoadingSubject.next(false); return of(null); })
    ).subscribe();
  }

  addRadioMotor(): void {
    if (!this.newRadioMotor.description?.trim() || !this.newRadioMotor.productId) { this.errorMessageSubject.next('Description and product are required.'); return; }
    this.isSavingSubject.next(true);
    this.configService.createRadioControlledMotor(this.newRadioMotor as Omit<RadioControlledMotorConfig, 'radioMotorId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Radio motor added.'); this.newRadioMotor = { productId: 0, description: '', widthCm: 0, price: 0 }; this.loadRadioMotorsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to add radio motor.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditRadioMotor(m: RadioControlledMotorConfig): void { this.editingRadioMotor = { ...m }; this.showEditModal = true; }

  saveEditRadioMotor(): void {
    if (!this.editingRadioMotor) return;
    this.isSavingSubject.next(true);
    this.configService.updateRadioControlledMotor(this.editingRadioMotor.radioMotorId, this.editingRadioMotor).pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Radio motor updated.'); this.closeEditModal(); this.loadRadioMotorsAndProducts(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to update radio motor.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteRadioMotor(m: RadioControlledMotorConfig): void {
    this.deleteTarget = { type: 'radioMotors', id: m.radioMotorId, label: m.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  SHARED — DELETE CONFIRM
  // ═════════════════════════════════════════════════════════════════════════════

  cancelDelete(): void { this.showDeleteModal = false; this.deleteTarget = null; }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.isDeletingSubject.next(true);
    const { type, id } = this.deleteTarget;

    const call$ =
      type === 'siteVisit'    ? this.configService.deleteSiteVisitValue(id)
    : type === 'brackets'     ? this.configService.deleteBracket(id)
    : type === 'suppliers'    ? this.configService.deleteSupplier(id)
    : type === 'productTypes' ? this.configService.deleteProductType(id)
    : type === 'products'     ? this.configService.deleteProduct(id)
    : type === 'arms'         ? this.configService.deleteArm(id)
    : type === 'motors'       ? this.configService.deleteMotor(id)
    : type === 'heaters'      ? this.configService.deleteHeater(id)
    : type === 'ralColours'   ? this.configService.deleteNonStandardRALColour(id)
    : type === 'projections'  ? this.configService.deleteProjection(id)
    :                           this.configService.deleteRadioControlledMotor(id);

    call$.pipe(
      takeUntil(this.destroy$),
      tap(() => { this.showSuccess('Item deleted successfully.'); this.showDeleteModal = false; this.deleteTarget = null; this.loadActiveTab(); }),
      catchError(() => { this.errorMessageSubject.next('Failed to delete item.'); return of(null); }),
      finalize(() => this.isDeletingSubject.next(false))
    ).subscribe();
  }

  // ── Edit modal dispatcher ─────────────────────────────────────────────────────

  saveEdit(): void {
    switch (this.activeTabSubject.value) {
      case 'siteVisit':    this.saveEditSv();           break;
      case 'brackets':     this.saveEditBracket();      break;
      case 'suppliers':    this.saveEditSupplier();     break;
      case 'productTypes': this.saveEditPt();           break;
      case 'products':     this.saveEditProd();         break;
      case 'arms':         this.saveEditArm();          break;
      case 'motors':       this.saveEditMotor();        break;
      case 'heaters':      this.saveEditHeater();       break;
      case 'ralColours':   this.saveEditRalColour();    break;
      case 'projections':  this.saveEditProjection();   break;
      case 'radioMotors':  this.saveEditRadioMotor();   break;
    }
  }

  closeEditModal(): void {
    this.showEditModal      = false;
    this.editingSv          = null;
    this.editingBracket     = null;
    this.editingSupplier    = null;
    this.editingPt          = null;
    this.editingProd        = null;
    this.editingArm         = null;
    this.editingMotor       = null;
    this.editingHeater      = null;
    this.editingRalColour   = null;
    this.editingProjection  = null;
    this.editingRadioMotor  = null;
  }

  // ── Messages ──────────────────────────────────────────────────────────────────

  private showSuccess(msg: string): void {
    this.successMessageSubject.next(msg);
    this.errorMessageSubject.next('');
    setTimeout(() => this.successMessageSubject.next(''), 3500);
  }

  clearMessages(): void {
    this.successMessageSubject.next('');
    this.errorMessageSubject.next('');
  }
}