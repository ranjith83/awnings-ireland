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
  ProductConfig
} from '../../service/configuration.service';

export type ConfigTab = 'siteVisit' | 'brackets' | 'suppliers' | 'productTypes' | 'products';

interface DeleteTarget {
  type: ConfigTab;
  id: number;
  label: string;
}

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
    { id: 'siteVisit',    label: 'Site Visit Values', icon: '🗂️' },
    { id: 'brackets',     label: 'Brackets',          icon: '🔩' },
    { id: 'suppliers',    label: 'Suppliers',          icon: '🏭' },
    { id: 'productTypes', label: 'Product Types',     icon: '📦' },
    { id: 'products',     label: 'Products',           icon: '🛠️' },
  ];

  // ── All state as BehaviorSubject → .asObservable() at field level ─────────────
  // Pattern mirrors CustomerDetails: subjects declared here so SSR gets valid
  // empty streams immediately, without any lifecycle hook or platform check needed.

  private activeTabSubject       = new BehaviorSubject<ConfigTab>('siteVisit');
  private isLoadingSubject       = new BehaviorSubject<boolean>(false);
  private isSavingSubject        = new BehaviorSubject<boolean>(false);
  private isDeletingSubject      = new BehaviorSubject<boolean>(false);
  private successMessageSubject  = new BehaviorSubject<string>('');
  private errorMessageSubject    = new BehaviorSubject<string>('');

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

  // ── Data subjects ─────────────────────────────────────────────────────────────
  private svSubject$           = new BehaviorSubject<SiteVisitValue[]>([]);
  private svCategoriesSubject$ = new BehaviorSubject<string[]>([]);
  private svFilterSubject$     = new BehaviorSubject<string>('');

  private bracketsSubject$        = new BehaviorSubject<BracketConfig[]>([]);
  private bracketProductsSubject$ = new BehaviorSubject<{ productId: number; label: string }[]>([]);
  private bracketFilterSubject$   = new BehaviorSubject<number | ''>('');

  private suppliersSubject$    = new BehaviorSubject<SupplierConfig[]>([]);

  private productTypesSubject$ = new BehaviorSubject<ProductTypeConfig[]>([]);
  private ptFilterSubject$     = new BehaviorSubject<number | ''>('');

  private productsSubject$          = new BehaviorSubject<ProductConfig[]>([]);
  private prodFilterSubject$        = new BehaviorSubject<number | ''>('');
  private newProdSupplierSubject$   = new BehaviorSubject<number>(0);
  private editProdSupplierSubject$  = new BehaviorSubject<number>(0);

  // ── Derived observables — all computed at field level, shareReplay(1) ─────────
  // combineLatest mirrors the filteredCustomers$ pattern from CustomerDetails.

  svCategories$: Observable<string[]> = this.svCategoriesSubject$.asObservable();

  filteredSiteVisitValues$: Observable<SiteVisitValue[]> = combineLatest([
    this.svSubject$,
    this.svFilterSubject$
  ]).pipe(
    map(([values, cat]) => cat ? values.filter(v => v.category === cat) : values),
    shareReplay(1)
  );

  filteredBrackets$: Observable<BracketConfig[]> = combineLatest([
    this.bracketsSubject$,
    this.bracketFilterSubject$
  ]).pipe(
    map(([brackets, pid]) => pid === '' ? brackets : brackets.filter(b => b.productId === pid)),
    shareReplay(1)
  );

  bracketProducts$: Observable<{ productId: number; label: string }[]> =
    this.bracketProductsSubject$.asObservable();

  suppliers$: Observable<SupplierConfig[]> = this.suppliersSubject$.asObservable();

  filteredProductTypes$: Observable<ProductTypeConfig[]> = combineLatest([
    this.productTypesSubject$,
    this.ptFilterSubject$
  ]).pipe(
    map(([types, sid]) => sid === '' ? types : types.filter(pt => pt.supplierId === sid)),
    shareReplay(1)
  );

  filteredProducts$: Observable<ProductConfig[]> = combineLatest([
    this.productsSubject$,
    this.prodFilterSubject$
  ]).pipe(
    map(([products, sid]) => sid === '' ? products : products.filter(p => p.supplierId === sid)),
    shareReplay(1)
  );

  filteredProductTypesForNew$: Observable<ProductTypeConfig[]> = combineLatest([
    this.productTypesSubject$,
    this.newProdSupplierSubject$
  ]).pipe(
    map(([types, sid]) => sid ? types.filter(pt => pt.supplierId === sid) : types),
    shareReplay(1)
  );

  filteredProductTypesForEdit$: Observable<ProductTypeConfig[]> = combineLatest([
    this.productTypesSubject$,
    this.editProdSupplierSubject$
  ]).pipe(
    map(([types, sid]) => sid ? types.filter(pt => pt.supplierId === sid) : types),
    shareReplay(1)
  );

  // ── Form models ───────────────────────────────────────────────────────────────
  newSv: Partial<SiteVisitValue>     = { category: '', value: '', displayOrder: 1, isActive: true };
  editingSv: SiteVisitValue | null   = null;

  newBracket: Partial<BracketConfig>     = { productId: 0, bracketName: '', partNumber: '', price: 0 };
  editingBracket: BracketConfig | null   = null;

  newSupplier: Partial<SupplierConfig>       = { supplierName: '' };
  editingSupplier: SupplierConfig | null     = null;

  newPt: Partial<ProductTypeConfig>       = { supplierId: 0, description: '' };
  editingPt: ProductTypeConfig | null     = null;

  newProd: Partial<ProductConfig>     = { supplierId: 0, productTypeId: 0, description: '' };
  editingProd: ProductConfig | null   = null;

  // ── Convenience getters for template two-way binding ─────────────────────────
  get svFilterCategory(): string             { return this.svFilterSubject$.value; }
  set svFilterCategory(v: string)            { this.svFilterSubject$.next(v); }

  get bracketFilterProduct(): number | ''    { return this.bracketFilterSubject$.value; }
  set bracketFilterProduct(v: number | '')   { this.bracketFilterSubject$.next(v); }

  get ptFilterSupplier(): number | ''        { return this.ptFilterSubject$.value; }
  set ptFilterSupplier(v: number | '')       { this.ptFilterSubject$.next(v); }

  get prodFilterSupplier(): number | ''      { return this.prodFilterSubject$.value; }
  set prodFilterSupplier(v: number | '')     { this.prodFilterSubject$.next(v); }

  get activeTab(): ConfigTab                 { return this.activeTabSubject.value; }

  /** Used in the edit modal title — resolves the human-readable tab label */
  get activeTabLabel(): string {
    return this.tabs.find(t => t.id === this.activeTabSubject.value)?.label ?? '';
  }

  constructor(private configService: ConfigurationService) {}

  ngOnInit(): void {
    // Identical to CustomerDetails.ngOnInit() — no platform check needed because
    // subjects are already initialised with empty arrays at field level, so SSR
    // renders the loading shell while the browser fires the real HTTP calls.
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
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  SITE VISIT VALUES
  // ═════════════════════════════════════════════════════════════════════════════

  loadSiteVisitValues(): void {
    this.isLoadingSubject.next(true);
    this.errorMessageSubject.next('');

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
      tap(() => {
        this.showSuccess('Site visit value added.');
        this.newSv = { category: '', value: '', displayOrder: 1, isActive: true };
        this.loadSiteVisitValues();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to add site visit value.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditSv(sv: SiteVisitValue): void {
    this.editingSv = { ...sv };
    this.showEditModal = true;
  }

  saveEditSv(): void {
    if (!this.editingSv) return;
    this.isSavingSubject.next(true);

    this.configService.updateSiteVisitValue(this.editingSv.id, this.editingSv).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Site visit value updated.');
        this.closeEditModal();
        this.loadSiteVisitValues();
      }),
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
    this.errorMessageSubject.next('');

    forkJoin({
      brackets: this.configService.getBrackets().pipe(catchError(() => of([] as BracketConfig[]))),
      products: this.configService.getProducts().pipe(catchError(() => of([] as ProductConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ brackets, products }) => {
        this.bracketsSubject$.next([...brackets].sort(
          (a, b) => a.productId - b.productId || a.bracketName.localeCompare(b.bracketName)));
        this.bracketProductsSubject$.next(
          products.map(p => ({ productId: p.productId, label: p.description })));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => {
        this.errorMessageSubject.next('Failed to load brackets.');
        this.isLoadingSubject.next(false);
        return of(null);
      })
    ).subscribe();
  }

  getProductLabel(productId: number): string {
    return this.bracketProductsSubject$.value.find(p => p.productId === productId)?.label
        ?? `Product ${productId}`;
  }

  addBracket(): void {
    if (!this.newBracket.bracketName?.trim() || !this.newBracket.productId) {
      this.errorMessageSubject.next('Bracket name and product are required.'); return;
    }
    this.isSavingSubject.next(true);

    this.configService.createBracket(this.newBracket as Omit<BracketConfig, 'bracketId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Bracket added.');
        this.newBracket = { productId: 0, bracketName: '', partNumber: '', price: 0 };
        this.loadBracketsAndProducts();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to add bracket.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditBracket(b: BracketConfig): void {
    this.editingBracket = { ...b };
    this.showEditModal = true;
  }

  saveEditBracket(): void {
    if (!this.editingBracket) return;
    this.isSavingSubject.next(true);

    this.configService.updateBracket(this.editingBracket.bracketId, this.editingBracket).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Bracket updated.');
        this.closeEditModal();
        this.loadBracketsAndProducts();
      }),
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
    this.errorMessageSubject.next('');

    this.configService.getSuppliers().pipe(
      takeUntil(this.destroy$),
      tap(data => {
        this.suppliersSubject$.next([...data].sort((a, b) => a.supplierName.localeCompare(b.supplierName)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => {
        this.errorMessageSubject.next('Failed to load suppliers.');
        this.isLoadingSubject.next(false);
        return of([]);
      })
    ).subscribe();
  }

  getSupplierName(id: number): string {
    return this.suppliersSubject$.value.find(s => s.supplierId === id)?.supplierName ?? `Supplier ${id}`;
  }

  addSupplier(): void {
    if (!this.newSupplier.supplierName?.trim()) {
      this.errorMessageSubject.next('Supplier name is required.'); return;
    }
    this.isSavingSubject.next(true);

    this.configService.createSupplier(this.newSupplier as Omit<SupplierConfig, 'supplierId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Supplier added.');
        this.newSupplier = { supplierName: '' };
        this.loadSuppliers();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to add supplier.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditSupplier(s: SupplierConfig): void {
    this.editingSupplier = { ...s };
    this.showEditModal = true;
  }

  saveEditSupplier(): void {
    if (!this.editingSupplier) return;
    this.isSavingSubject.next(true);

    this.configService.updateSupplier(this.editingSupplier.supplierId, this.editingSupplier).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Supplier updated.');
        this.closeEditModal();
        this.loadSuppliers();
      }),
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
    this.errorMessageSubject.next('');

    forkJoin({
      types:     this.configService.getProductTypes().pipe(catchError(() => of([] as ProductTypeConfig[]))),
      suppliers: this.configService.getSuppliers().pipe(catchError(() => of([] as SupplierConfig[])))
    }).pipe(
      takeUntil(this.destroy$),
      tap(({ types, suppliers }) => {
        this.productTypesSubject$.next([...types].sort(
          (a, b) => a.supplierId - b.supplierId || a.description.localeCompare(b.description)));
        this.suppliersSubject$.next([...suppliers].sort((a, b) => a.supplierName.localeCompare(b.supplierName)));
        this.isLoadingSubject.next(false);
      }),
      catchError(() => {
        this.errorMessageSubject.next('Failed to load product types.');
        this.isLoadingSubject.next(false);
        return of(null);
      })
    ).subscribe();
  }

  addProductType(): void {
    if (!this.newPt.description?.trim() || !this.newPt.supplierId) {
      this.errorMessageSubject.next('Description and supplier are required.'); return;
    }
    this.isSavingSubject.next(true);

    this.configService.createProductType(this.newPt as Omit<ProductTypeConfig, 'productTypeId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Product type added.');
        this.newPt = { supplierId: 0, description: '' };
        this.loadProductTypesAndSuppliers();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to add product type.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditPt(pt: ProductTypeConfig): void {
    this.editingPt = { ...pt };
    this.showEditModal = true;
  }

  saveEditPt(): void {
    if (!this.editingPt) return;
    this.isSavingSubject.next(true);

    this.configService.updateProductType(this.editingPt.productTypeId, this.editingPt).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Product type updated.');
        this.closeEditModal();
        this.loadProductTypesAndSuppliers();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to update product type.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeletePt(pt: ProductTypeConfig): void {
    this.deleteTarget = { type: 'productTypes', id: pt.productTypeId, label: pt.description };
    this.showDeleteModal = true;
  }

  getProductTypeName(id: number): string {
    return this.productTypesSubject$.value.find(pt => pt.productTypeId === id)?.description ?? `Type ${id}`;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  PRODUCTS
  // ═════════════════════════════════════════════════════════════════════════════

  loadProductsAndDeps(): void {
    this.isLoadingSubject.next(true);
    this.errorMessageSubject.next('');

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
        this.isLoadingSubject.next(false);
      }),
      catchError(() => {
        this.errorMessageSubject.next('Failed to load products.');
        this.isLoadingSubject.next(false);
        return of(null);
      })
    ).subscribe();
  }

  onNewProdSupplierChange(): void {
    this.newProd.productTypeId = 0;
    this.newProdSupplierSubject$.next(this.newProd.supplierId ?? 0);
  }

  onEditProdSupplierChange(): void {
    if (this.editingProd) {
      this.editingProd.productTypeId = 0;
      this.editProdSupplierSubject$.next(this.editingProd.supplierId);
    }
  }

  addProduct(): void {
    if (!this.newProd.description?.trim() || !this.newProd.supplierId || !this.newProd.productTypeId) {
      this.errorMessageSubject.next('Description, supplier, and product type are required.'); return;
    }
    this.isSavingSubject.next(true);

    this.configService.createProduct(this.newProd as Omit<ProductConfig, 'productId'>).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Product added.');
        this.newProd = { supplierId: 0, productTypeId: 0, description: '' };
        this.loadProductsAndDeps();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to add product.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  openEditProd(p: ProductConfig): void {
    this.editingProd = { ...p };
    this.editProdSupplierSubject$.next(p.supplierId);
    this.showEditModal = true;
  }

  saveEditProd(): void {
    if (!this.editingProd) return;
    this.isSavingSubject.next(true);

    this.configService.updateProduct(this.editingProd.productId, this.editingProd).pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Product updated.');
        this.closeEditModal();
        this.loadProductsAndDeps();
      }),
      catchError(() => { this.errorMessageSubject.next('Failed to update product.'); return of(null); }),
      finalize(() => this.isSavingSubject.next(false))
    ).subscribe();
  }

  confirmDeleteProd(p: ProductConfig): void {
    this.deleteTarget = { type: 'products', id: p.productId, label: p.description };
    this.showDeleteModal = true;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  SHARED — DELETE CONFIRM
  // ═════════════════════════════════════════════════════════════════════════════

  cancelDelete(): void {
    this.showDeleteModal = false;
    this.deleteTarget = null;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.isDeletingSubject.next(true);
    const { type, id } = this.deleteTarget;

    const call$ = type === 'siteVisit'    ? this.configService.deleteSiteVisitValue(id)
                : type === 'brackets'     ? this.configService.deleteBracket(id)
                : type === 'suppliers'    ? this.configService.deleteSupplier(id)
                : type === 'productTypes' ? this.configService.deleteProductType(id)
                :                          this.configService.deleteProduct(id);

    call$.pipe(
      takeUntil(this.destroy$),
      tap(() => {
        this.showSuccess('Item deleted successfully.');
        this.showDeleteModal = false;
        this.deleteTarget = null;
        this.loadActiveTab();
      }),
      catchError(() => {
        this.errorMessageSubject.next('Failed to delete item.');
        return of(null);
      }),
      finalize(() => this.isDeletingSubject.next(false))
    ).subscribe();
  }

  // ── Edit modal shared save dispatcher ────────────────────────────────────────

  saveEdit(): void {
    switch (this.activeTabSubject.value) {
      case 'siteVisit':    this.saveEditSv();       break;
      case 'brackets':     this.saveEditBracket();   break;
      case 'suppliers':    this.saveEditSupplier();  break;
      case 'productTypes': this.saveEditPt();        break;
      case 'products':     this.saveEditProd();      break;
    }
  }

  closeEditModal(): void {
    this.showEditModal   = false;
    this.editingSv       = null;
    this.editingBracket  = null;
    this.editingSupplier = null;
    this.editingPt       = null;
    this.editingProd     = null;
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