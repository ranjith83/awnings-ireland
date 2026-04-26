import { Component, HostListener, OnDestroy, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, takeUntil, tap, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  WorkflowService,
  SupplierDto,
  ProductDto,
  ProductTypeDto,
  MotorDto,
  HeaterDto,
  BracketDto,
  LightingCassetteDto,
  ControlDto
} from '../../service/workflow.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';

interface CalculatorItem {
  id?:                number;   // addon slot marker (same as create-quote)
  description:        string;
  quantity:           number;
  unitPrice:          number;
  taxRate:            number;
  discountPercentage: number;
  amount:             number;
}

@Component({
  selector: 'app-quick-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quick-calculator.component.html',
  styleUrl: './quick-calculator.component.css'
})
export class QuickCalculatorComponent implements OnInit, OnDestroy {
  @Output() closeCalculator = new EventEmitter<void>();

  // ── Observables ───────────────────────────────────────────────────────────
  suppliers$!:            Observable<SupplierDto[]>;
  productTypes$!:         Observable<ProductTypeDto[]>;
  products$!:             Observable<ProductDto[]>;
  brackets$!:             Observable<BracketDto[]>;
  uniqueBrackets$!:       Observable<BracketDto[]>;
  motors$!:               Observable<MotorDto[]>;
  heaters$!:              Observable<HeaterDto[]>;
  lightingCassettes$!:    Observable<LightingCassetteDto[]>;
  controls$!:             Observable<ControlDto[]>;
  availableProjections$!: Observable<number[]>;
  calculatorItems$!:      Observable<CalculatorItem[]>;

  subtotal$!:      Observable<number>;
  itemDiscount$!:  Observable<number>;
  quoteDiscount$!: Observable<number>;
  totalTax$!:      Observable<number>;
  totalAmount$!:   Observable<number>;
  hasItems$!:      Observable<boolean>;

  // ── State subjects ────────────────────────────────────────────────────────
  private suppliersSubject$         = new BehaviorSubject<SupplierDto[]>([]);
  private productTypesSubject$      = new BehaviorSubject<ProductTypeDto[]>([]);
  private productsSubject$          = new BehaviorSubject<ProductDto[]>([]);
  private bracketsSubject$          = new BehaviorSubject<BracketDto[]>([]);
  private motorsSubject$            = new BehaviorSubject<MotorDto[]>([]);
  private heatersSubject$           = new BehaviorSubject<HeaterDto[]>([]);
  private lightingCassettesSubject$ = new BehaviorSubject<LightingCassetteDto[]>([]);
  private controlsSubject$          = new BehaviorSubject<ControlDto[]>([]);
  private projectionsSubject$       = new BehaviorSubject<number[]>([]);
  private calculatorItemsSubject$   = new BehaviorSubject<CalculatorItem[]>([]);

  // ── Product selection ─────────────────────────────────────────────────────
  selectedSupplierId:    number | null = null;
  selectedProductTypeId: number | null = null;
  selectedProductId:     number | null = null;
  selectedProductName:   string = '';

  // ── Dimensions ────────────────────────────────────────────────────────────
  enteredWidthCm:  number | null = null;   // what the user types
  selectedWidthCm: number | null = null;   // floor-tier resolved for pricing
  selectedAwning:  number | null = null;
  calculatedPrice: number = 0;
  private _standardWidths: number[] = [];

  // ── Brackets (multi-select) ───────────────────────────────────────────────
  selectedBrackets:    string[] = [];
  bracketDropdownOpen: boolean  = false;

  // ── Addons ────────────────────────────────────────────────────────────────
  selectedMotor:            string  = '';
  selectedHeater:           string  = '';
  selectedLightingCassette: string  = '';
  selectedControl:          string  = '';
  includeElectrician:       boolean = false;
  electricianPrice:         number  = 280.00;
  installationFee:          number  = 0;
  vatRate:                  number  = 13.5;

  // Extras (free-text)
  extrasDescription: string = '';
  extrasPrice:       number = 0;

  // RAL Surcharge
  includeRalSurcharge = false;
  hasRalSurcharge     = false;

  // ShadePlus
  includeShadeplus     = false;
  hasShadePlus         = false;
  shadePlusHasMultiple = false;
  shadePlusAllRows: { shadePlusId: number; description: string; widthCm: number; price: number }[] = [];
  shadePlusOptions: { shadePlusId: number; description: string; price: number }[] = [];
  selectedShadePlusId: number | null = null;
  selectedShadePlusDescription = '';

  // Valance Style
  includeValanceStyle = false;
  hasValanceStyle     = false;

  // Wall Sealing
  includeWallSealing = false;
  hasWallSealing     = false;

  // ── Quote-level discount ──────────────────────────────────────────────────
  discountType:  string = '';
  discountValue: number = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private workflowService: WorkflowService,
    private pdfService:      PdfGenerationService
  ) {}

  ngOnInit() {
    this.initializeObservables();
    this.loadSuppliers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      this.bracketDropdownOpen = false;
    }
  }

  // ── Observable setup ──────────────────────────────────────────────────────

  private initializeObservables() {
    this.suppliers$            = this.suppliersSubject$.asObservable();
    this.productTypes$         = this.productTypesSubject$.asObservable();
    this.products$             = this.productsSubject$.asObservable();
    this.brackets$             = this.bracketsSubject$.asObservable();
    this.uniqueBrackets$       = this.brackets$.pipe(
      map(brackets => {
        const seen = new Set<string>();
        return brackets.filter(b => {
          if (seen.has(b.bracketName)) return false;
          seen.add(b.bracketName);
          return true;
        });
      })
    );
    this.motors$               = this.motorsSubject$.asObservable();
    this.heaters$              = this.heatersSubject$.asObservable();
    this.lightingCassettes$    = this.lightingCassettesSubject$.asObservable();
    this.controls$             = this.controlsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.calculatorItems$      = this.calculatorItemsSubject$.asObservable();
    this.hasItems$             = this.calculatorItems$.pipe(map(items => items.length > 0));

    this.subtotal$ = this.calculatorItems$.pipe(
      map(items => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0))
    );

    this.itemDiscount$ = this.calculatorItems$.pipe(
      map(items => items.reduce(
        (sum, i) => sum + i.quantity * i.unitPrice * (i.discountPercentage / 100), 0))
    );

    this.quoteDiscount$ = combineLatest([this.subtotal$, this.itemDiscount$]).pipe(
      map(([subtotal, itemDisc]) => {
        const base = subtotal - itemDisc;
        if (!this.discountType || this.discountValue <= 0) return 0;
        if (this.discountType === 'Percentage') return base * (this.discountValue / 100);
        return Math.min(this.discountValue, base);
      })
    );

    this.totalTax$ = combineLatest([this.calculatorItems$, this.itemDiscount$, this.subtotal$, this.quoteDiscount$]).pipe(
      map(([items, itemDisc, subtotal, quoteDisc]) => {
        const itemTax = items.reduce((sum, i) => {
          const line     = i.quantity * i.unitPrice;
          const lineDisc = line * (i.discountPercentage / 100);
          return sum + (line - lineDisc) * (i.taxRate / 100);
        }, 0);
        const afterItemDisc  = subtotal - itemDisc;
        const quoteDiscRatio = afterItemDisc > 0 ? (1 - quoteDisc / afterItemDisc) : 1;
        return itemTax * quoteDiscRatio;
      })
    );

    this.totalAmount$ = combineLatest([this.subtotal$, this.itemDiscount$, this.quoteDiscount$, this.totalTax$]).pipe(
      map(([sub, iDisc, qDisc, tax]) => sub - iDisc - qDisc + tax)
    );
  }

  // ── Loaders ───────────────────────────────────────────────────────────────

  private loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(takeUntil(this.destroy$), tap(s => this.suppliersSubject$.next(s)), catchError(() => of([])))
      .subscribe();
  }

  // ── Product selection handlers ────────────────────────────────────────────

  onSupplierChange() {
    if (!this.selectedSupplierId) return;
    this.selectedProductTypeId = null;
    this.selectedProductId = null;
    this.productTypesSubject$.next([]);
    this.productsSubject$.next([]);
    this.workflowService.getAllProductTypesForSupplier(this.selectedSupplierId)
      .pipe(takeUntil(this.destroy$), tap(t => this.productTypesSubject$.next(t)), catchError(() => of([])))
      .subscribe();
    this.resetCalculator();
  }

  onProductTypeChange() {
    if (!this.selectedSupplierId || !this.selectedProductTypeId) return;
    this.selectedProductId = null;
    this.productsSubject$.next([]);
    this.workflowService.getAllProductsBySupplier(this.selectedSupplierId, this.selectedProductTypeId)
      .pipe(takeUntil(this.destroy$), tap(p => this.productsSubject$.next(p)), catchError(() => of([])))
      .subscribe();
    this.resetCalculator();
  }

  onProductChange() {
    if (!this.selectedProductId) return;
    const product = this.productsSubject$.value.find(p => p.productId === this.selectedProductId);
    if (product) this.selectedProductName = product.productName;
    this.loadProductWidthsAndProjections();
    this.loadProductAddons();
    this.resetCalculator();
  }

  private loadProductWidthsAndProjections() {
    if (!this.selectedProductId) return;
    const id = this.selectedProductId;
    this.workflowService.getStandardWidthsForProduct(id)
      .pipe(takeUntil(this.destroy$), map(w => w.sort((a, b) => a - b)), catchError(() => of([])))
      .subscribe(w => {
        this._standardWidths = w;
        // Re-resolve in case user already typed a width before this API returned
        if (this.enteredWidthCm) {
          this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
          this.checkAndGenerateFirstLineItem();
        }
      });
    this.workflowService.getProjectionWidthsForProduct(id)
      .pipe(takeUntil(this.destroy$), map(p => p.sort((a, b) => a - b)), tap(v => this.projectionsSubject$.next(v)), catchError(() => of([])))
      .subscribe();
  }

  private resolveCeilingWidth(entered: number | null): number | null {
    if (!entered || entered <= 0) return null;
    const widths = this._standardWidths;
    if (!widths.length) return null;
    const sorted = [...widths].sort((a, b) => a - b);
    const floor = [...sorted].reverse().find(w => w <= entered);
    if (floor != null) return floor;
    return sorted[0];
  }

  private loadProductAddons() {
    if (!this.selectedProductId) return;
    const id = this.selectedProductId;

    // Reset availability flags so stale data from prior product doesn't linger
    this.hasRalSurcharge = false;
    this.hasShadePlus    = false;
    this.hasValanceStyle = false;
    this.hasWallSealing  = false;
    this.shadePlusOptions = [];
    this.shadePlusAllRows = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeShadeplus = false;
    this.removeAddonItem('shadeplus');

    this.workflowService.hasNonStandardRALColours(id)
      .pipe(takeUntil(this.destroy$)).subscribe(v => this.hasRalSurcharge = v);

    this.workflowService.getShadePlusOptions(id, 0)
      .pipe(takeUntil(this.destroy$), catchError(() => of({ hasMultiple: false, options: [] })))
      .subscribe(result => {
        const opts = result.options ?? [];
        this.hasShadePlus         = opts.length > 0;
        this.shadePlusHasMultiple = result.hasMultiple;
        this.shadePlusAllRows = opts.map(o => ({
          shadePlusId: o.shadePlusId,
          description: o.description ?? '',
          widthCm:     (o as any).widthCm ?? 0,
          price:       o.price
        }));
        const seen = new Set<string>();
        this.shadePlusOptions = opts
          .filter(o => {
            const key = o.description ?? '';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(o => ({ shadePlusId: o.shadePlusId, description: o.description ?? '', price: o.price }));
        if (this.shadePlusOptions.length > 0) {
          this.selectedShadePlusId = this.shadePlusOptions[0].shadePlusId;
          this.selectedShadePlusDescription = this.shadePlusOptions[0].description;
        }
      });

    this.workflowService.hasValanceStyles(id)
      .pipe(takeUntil(this.destroy$)).subscribe(v => this.hasValanceStyle = v);
    this.workflowService.hasWallSealingProfiles(id)
      .pipe(takeUntil(this.destroy$)).subscribe(v => this.hasWallSealing = v);

    this.reloadArmTypeDependents();
    this.workflowService.getHeatersForProduct(id)
      .pipe(takeUntil(this.destroy$), tap(v => this.heatersSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getLightingCassettesForProduct(id)
      .pipe(takeUntil(this.destroy$), tap(v => this.lightingCassettesSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getControlsForProduct(id)
      .pipe(takeUntil(this.destroy$), tap(v => this.controlsSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  private reloadArmTypeDependents() {
    if (!this.selectedProductId) return;
    const productId = this.selectedProductId;

    if (this.selectedWidthCm && this.selectedAwning) {
      this.workflowService.getArmTypeForProjection(productId, this.selectedWidthCm, this.selectedAwning)
        .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
        .subscribe(armTypeId => {
          if (armTypeId == null) return;
          this.workflowService.getBracketsForProduct(productId, armTypeId)
            .pipe(takeUntil(this.destroy$), catchError(() => of([])))
            .subscribe(brackets => { this.bracketsSubject$.next(brackets); this.onBracketChange(); });
          this.workflowService.getMotorsForProduct(productId, armTypeId)
            .pipe(takeUntil(this.destroy$), catchError(() => of([])))
            .subscribe(motors => {
              this.motorsSubject$.next(motors);
              if (this.selectedMotor && !motors.some(m => m.motorId.toString() === this.selectedMotor)) {
                this.selectedMotor = '';
                this.onMotorChange();
              }
            });
        });
    } else {
      this.workflowService.getBracketsForProduct(productId, 1)
        .pipe(takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(brackets => {
          this.bracketsSubject$.next(brackets);
          if (this.selectedBrackets.length === 0) {
            const def = brackets.find(b =>
              b.bracketName.toLowerCase().includes('surcharge for face fixture') &&
              !b.bracketName.toLowerCase().includes('spreader')
            );
            if (def) {
              this.selectedBrackets = [def.bracketName];
              this.onBracketChange();
            }
          } else {
            this.onBracketChange();
          }
        });

      this.workflowService.getMotorsForProduct(productId, 1)
        .pipe(takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe(motors => {
          this.motorsSubject$.next(motors);
          if (!this.selectedMotor) {
            const def = motors.find(m =>
              m.description.toLowerCase().includes('radio') &&
              m.description.toLowerCase().includes('rts') &&
              m.description.toLowerCase().includes('1 ch')
            );
            if (def) {
              this.selectedMotor = def.motorId.toString();
              this.onMotorChange();
            }
          }
        });
    }
  }

  // ── Dimension handlers ────────────────────────────────────────────────────

  onWidthInput() {
    this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
    if (this.includeRalSurcharge) this.onRalSurchargeChange();
    if (this.includeShadeplus)    this.onShadeplusChange();
    if (this.includeValanceStyle) this.onValanceStyleChange();
    if (this.includeWallSealing)  this.onWallSealingChange();
  }

  onAwningChange() {
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
  }

  private checkAndGenerateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedWidthCm || !this.selectedAwning || !this.selectedProductId) return;
    this.workflowService.getProjectionPriceForProduct(this.selectedProductId, this.selectedWidthCm, this.selectedAwning)
      .pipe(takeUntil(this.destroy$), catchError(() => of(0)))
      .subscribe(price => { this.calculatedPrice = price; this.generateFirstLineItem(); });
  }

  private generateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedAwning || !this.selectedProductName) return;
    const widthM      = (this.enteredWidthCm / 100).toFixed(2).replace(/\.?0+$/, '') + 'm';
    const projectionM = (this.selectedAwning  / 100).toFixed(0) + 'm';
    const suffix      = this.installationFee > 0 ? 'Supply & Fit' : 'Supply Only';
    const description = `${this.selectedProductName} closed cassette awning ${widthM} wide x ${projectionM} projection ${suffix}`;
    const unitPrice   = this.calculatedPrice + (this.installationFee || 0);
    const item        = this.makeItem(description, 1, unitPrice);
    const current     = this.calculatorItemsSubject$.value;
    if (current.length > 0 && current[0].description.includes('wide x')) {
      current[0] = item; this.calculatorItemsSubject$.next([...current]);
    } else {
      this.calculatorItemsSubject$.next([item, ...current]);
    }
  }

  // ── Bracket multi-select ──────────────────────────────────────────────────

  toggleBracketDropdown() { this.bracketDropdownOpen = !this.bracketDropdownOpen; }

  isBracketSelected(bracketName: string): boolean {
    return this.selectedBrackets.includes(bracketName);
  }

  toggleBracket(bracketName: string) {
    const idx = this.selectedBrackets.indexOf(bracketName);
    if (idx === -1) this.selectedBrackets = [...this.selectedBrackets, bracketName];
    else            this.selectedBrackets = this.selectedBrackets.filter(b => b !== bracketName);
    this.onBracketChange();
  }

  getBracketLabel(): string {
    if (!this.selectedBrackets.length) return 'Select brackets';
    if (this.selectedBrackets.length === 1) return this.selectedBrackets[0];
    return `${this.selectedBrackets.length} brackets selected`;
  }

  // ── Addon handlers ────────────────────────────────────────────────────────

  onBracketChange() {
    this.removeAllBracketItems();
    if (!this.selectedBrackets.length) return;
    const allBrackets = this.bracketsSubject$.value;
    const seen = new Set<string>();
    const selected = allBrackets.filter(b => {
      if (!this.selectedBrackets.includes(b.bracketName)) return false;
      if (seen.has(b.bracketName)) return false;
      seen.add(b.bracketName);
      return true;
    });
    if (selected.length === 0) return;
    const items = this.calculatorItemsSubject$.value;
    let insertIdx = 1;
    selected.forEach(b => {
      const item = this.makeItem(b.bracketName, 1, b.price, 200000 + b.bracketId);
      items.splice(insertIdx, 0, item);
      insertIdx++;
    });
    this.calculatorItemsSubject$.next([...items]);
  }

  private removeAllBracketItems() {
    const items = this.calculatorItemsSubject$.value;
    const filtered = items.filter(i => !i.id || i.id < 200000);
    if (filtered.length !== items.length) this.calculatorItemsSubject$.next(filtered);
  }

  onMotorChange() {
    if (!this.selectedMotor) { this.removeAddonItem('motor'); return; }
    const m = this.motorsSubject$.value.find(x => x.motorId.toString() === this.selectedMotor);
    if (m) this.addOrUpdateAddonItem('motor', this.makeItem(m.description, 1, m.price, this.getAddonItemId('motor')));
  }

  onHeaterChange() {
    if (!this.selectedHeater) { this.removeAddonItem('heater'); return; }
    const h = this.heatersSubject$.value.find(x => x.heaterId.toString() === this.selectedHeater);
    if (h) this.addOrUpdateAddonItem('heater', this.makeItem(h.description, 1, h.price, this.getAddonItemId('heater')));
  }

  onLightingCassetteChange() {
    if (!this.selectedLightingCassette) { this.removeAddonItem('lighting'); return; }
    const c = this.lightingCassettesSubject$.value.find(x => x.lightingId.toString() === this.selectedLightingCassette);
    if (c) this.addOrUpdateAddonItem('lighting', this.makeItem(c.description, 1, c.price, this.getAddonItemId('lighting')));
  }

  onControlChange() {
    if (!this.selectedControl) { this.removeAddonItem('control'); return; }
    const c = this.controlsSubject$.value.find(x => x.controlId.toString() === this.selectedControl);
    if (c) this.addOrUpdateAddonItem('control', this.makeItem(c.description, 1, c.price, this.getAddonItemId('control')));
  }

  onElectricianChange() {
    if (!this.includeElectrician) { this.removeAddonItem('electrician'); return; }
    this.addOrUpdateAddonItem('electrician',
      this.makeItem('Electric connection by our Qualified Electrician', 1, this.electricianPrice, this.getAddonItemId('electrician')));
  }

  onInstallationFeeChange() {
    this.removeAddonItem('installation');
    this.generateFirstLineItem();
  }

  onExtrasChange() {
    if (!this.extrasDescription || this.extrasPrice <= 0) { this.removeAddonItem('arm'); return; }
    this.addOrUpdateAddonItem('arm', this.makeItem(this.extrasDescription, 1, this.extrasPrice, this.getAddonItemId('arm')));
  }

  onRalSurchargeChange() {
    if (!this.includeRalSurcharge) { this.removeAddonItem('ral'); return; }
    if (!this.selectedProductId || !this.selectedWidthCm) return;
    this.workflowService.getNonStandardRALColourPrice(this.selectedProductId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => this.addOrUpdateAddonItem('ral',
        this.makeItem('Surcharge for non-standard RAL colors', 1, price, this.getAddonItemId('ral'))));
  }

  onShadeplusChange() {
    if (!this.includeShadeplus) { this.removeAddonItem('shadeplus'); return; }
    if (!this.selectedProductId || this.shadePlusOptions.length === 0) return;
    const chosen = this.shadePlusOptions.find(o => o.shadePlusId === this.selectedShadePlusId) ?? this.shadePlusOptions[0];
    if (!chosen) return;
    this.selectedShadePlusId = chosen.shadePlusId;
    this.selectedShadePlusDescription = chosen.description;
    const lineDesc = this.shadePlusHasMultiple ? chosen.description : 'ShadePlus';
    const addItem = (price: number) => {
      this.addOrUpdateAddonItem('shadeplus', this.makeItem(lineDesc, 1, price, this.getAddonItemId('shadeplus')));
    };
    if (this.selectedWidthCm) {
      const widthRow = this.shadePlusAllRows.find(r => r.description === chosen.description && r.widthCm === this.selectedWidthCm);
      addItem(widthRow?.price ?? chosen.price);
    } else {
      addItem(chosen.price);
    }
  }

  onShadeplusOptionChange() {
    const chosen = this.shadePlusOptions.find(o => o.shadePlusId === this.selectedShadePlusId);
    if (chosen) this.selectedShadePlusDescription = chosen.description;
    if (this.includeShadeplus) this.onShadeplusChange();
  }

  onValanceStyleChange() {
    if (!this.includeValanceStyle) { this.removeAddonItem('valance'); return; }
    if (!this.selectedProductId || !this.selectedWidthCm) return;
    this.workflowService.getValanceStylePrice(this.selectedProductId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => this.addOrUpdateAddonItem('valance',
        this.makeItem('Valance Style', 1, price, this.getAddonItemId('valance'))));
  }

  onWallSealingChange() {
    if (!this.includeWallSealing) { this.removeAddonItem('wallsealing'); return; }
    if (!this.selectedProductId || !this.selectedWidthCm) return;
    this.workflowService.getWallSealingProfilePrice(this.selectedProductId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => this.addOrUpdateAddonItem('wallsealing',
        this.makeItem('Wall Sealing Profile', 1, price, this.getAddonItemId('wallsealing'))));
  }

  onDiscountChange() {
    this.calculatorItemsSubject$.next([...this.calculatorItemsSubject$.value]);
  }

  // ── Grid item handlers ────────────────────────────────────────────────────

  onQuantityChange(item: CalculatorItem) {
    item.amount = this.calcItemAmount(item);
    this.calculatorItemsSubject$.next([...this.calculatorItemsSubject$.value]);
  }

  onItemChange(item: CalculatorItem) {
    item.amount = this.calcItemAmount(item);
    this.calculatorItemsSubject$.next([...this.calculatorItemsSubject$.value]);
  }

  onItemDiscountChange(item: CalculatorItem) {
    item.amount = this.calcItemAmount(item);
    this.calculatorItemsSubject$.next([...this.calculatorItemsSubject$.value]);
  }

  addCustomItem() {
    const items = this.calculatorItemsSubject$.value;
    items.push(this.makeItem('', 1, 0));
    this.calculatorItemsSubject$.next([...items]);
  }

  removeItem(index: number) {
    const items = this.calculatorItemsSubject$.value;
    items.splice(index, 1);
    this.calculatorItemsSubject$.next([...items]);
  }

  // ── PDF generation ────────────────────────────────────────────────────────

  generateEstimatePdf() {
    const items = this.calculatorItemsSubject$.value;
    if (items.length === 0) return;
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const itemDisc = items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.discountPercentage / 100), 0);
    const base     = subtotal - itemDisc;
    let quoteDisc  = 0;
    if (this.discountType && this.discountValue > 0) {
      quoteDisc = this.discountType === 'Percentage'
        ? base * (this.discountValue / 100)
        : Math.min(this.discountValue, base);
    }
    const itemTax = items.reduce((s, i) => {
      const line = i.quantity * i.unitPrice * (1 - i.discountPercentage / 100);
      return s + line * (i.taxRate / 100);
    }, 0);
    const quoteDiscRatio = base > 0 ? (1 - quoteDisc / base) : 1;
    const totalTax       = itemTax * quoteDiscRatio;
    const total          = subtotal - itemDisc - quoteDisc + totalTax;

    const pdfData: QuotePdfData = {
      quoteNumber:        'ESTIMATE-' + Date.now(),
      quoteDate:          new Date().toLocaleDateString('en-GB'),
      expiryDate:         this.getFollowUpDate(),
      customerName:       'Phone Enquiry',
      customerAddress:    '',
      customerCity:       '',
      customerPostalCode: '',
      reference:          this.selectedProductName || 'Quick Estimate',
      items: items.map(i => ({
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        tax:         i.taxRate,
        amount:      i.amount
      })),
      subtotal,
      discount:  itemDisc + quoteDisc > 0 ? itemDisc + quoteDisc : undefined,
      totalTax,
      taxRate:   this.vatRate,
      total,
      terms: 'This is an estimate only. Final quote subject to site survey.'
    };
    this.pdfService.generateQuotePdf(pdfData);
  }

  // ── Reset / Clear ─────────────────────────────────────────────────────────

  resetCalculator() {
    this.enteredWidthCm           = null;
    this.selectedWidthCm          = null;
    this.selectedAwning           = null;
    this.selectedBrackets         = [];
    this.selectedMotor            = '';
    this.selectedHeater           = '';
    this.selectedLightingCassette = '';
    this.selectedControl          = '';
    this.includeElectrician       = false;
    this.installationFee          = 0;
    this.calculatedPrice          = 0;
    this.extrasDescription        = '';
    this.extrasPrice              = 0;
    this.includeRalSurcharge      = false;
    this.includeShadeplus         = false;
    this.includeValanceStyle      = false;
    this.includeWallSealing       = false;
    this.discountType             = '';
    this.discountValue            = 0;
    this.calculatorItemsSubject$.next([]);
  }

  clearAll() {
    this.selectedSupplierId    = null;
    this.selectedProductTypeId = null;
    this.selectedProductId     = null;
    this.selectedProductName   = '';
    this._standardWidths       = [];
    this.hasRalSurcharge  = false;
    this.hasShadePlus     = false;
    this.hasValanceStyle  = false;
    this.hasWallSealing   = false;
    this.shadePlusOptions = [];
    this.shadePlusAllRows = [];
    this.productTypesSubject$.next([]);
    this.productsSubject$.next([]);
    this.projectionsSubject$.next([]);
    this.bracketsSubject$.next([]);
    this.motorsSubject$.next([]);
    this.heatersSubject$.next([]);
    this.lightingCassettesSubject$.next([]);
    this.controlsSubject$.next([]);
    this.resetCalculator();
  }

  close() { this.clearAll(); this.closeCalculator.emit(); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeItem(description: string, quantity: number, unitPrice: number, id?: number): CalculatorItem {
    return { id, description, quantity, unitPrice, taxRate: this.vatRate, discountPercentage: 0,
             amount: unitPrice * quantity };
  }

  private calcItemAmount(item: CalculatorItem): number {
    const gross = item.quantity * item.unitPrice;
    const disc  = gross * (item.discountPercentage / 100);
    return gross - disc;
  }

  private getAddonItemId(type: string): number {
    const ids: { [k: string]: number } = {
      bracket: 100001, arm: 100002, motor: 100003, heater: 100004,
      electrician: 100005, installation: 100006, ral: 100007,
      shadeplus: 100008, valance: 100009, wallsealing: 100010,
      lighting: 100011, control: 100012
    };
    return ids[type] || 0;
  }

  private addOrUpdateAddonItem(type: string, item: CalculatorItem) {
    const items = this.calculatorItemsSubject$.value;
    const idx   = items.findIndex(i => i.id === item.id);
    if (idx !== -1) { items[idx] = item; }
    else { const at = this.getAddonInsertIndex(type); items.splice(at, 0, item); }
    this.calculatorItemsSubject$.next([...items]);
  }

  private removeAddonItem(type: string) {
    const id    = this.getAddonItemId(type);
    const items = this.calculatorItemsSubject$.value;
    const idx   = items.findIndex(i => i.id === id);
    if (idx !== -1) { items.splice(idx, 1); this.calculatorItemsSubject$.next([...items]); }
  }

  private getAddonInsertIndex(type: string): number {
    const order = ['bracket', 'arm', 'motor', 'heater', 'electrician', 'installation', 'ral', 'shadeplus', 'valance', 'wallsealing', 'lighting', 'control'];
    const items = this.calculatorItemsSubject$.value;
    let idx = 1;
    for (let i = 0; i < order.indexOf(type); i++) {
      if (order[i] === 'bracket') {
        idx += items.filter(item => item.id !== undefined && item.id >= 200000).length;
      } else if (items.some(item => item.id === this.getAddonItemId(order[i]))) {
        idx++;
      }
    }
    return idx;
  }

  private getFollowUpDate(): string {
    const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().split('T')[0];
  }
}
