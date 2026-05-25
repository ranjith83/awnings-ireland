import { Component, HostListener, OnDestroy, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, takeUntil, tap, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  WorkflowService,
  FrameColourOption,
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
import { OptionLookupService, OptionLookupDto } from '../../service/option-lookup.service';

interface CalculatorItem {
  id?:                number;   // addon slot marker (same as create-quote)
  description:        string;
  quantity:           number;
  unitPrice:          number;
  taxRate:            number;
  discountPercentage: number;
  amount:             number;
}

interface SavedQuote {
  id:            string;
  name:          string;
  savedAt:       string;
  productName:   string;
  items:         CalculatorItem[];
  subtotal:      number;
  totalAmount:   number;
  discountType:  string;
  discountValue: number;
  vatRate:       number;
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
  dimensionError  = '';
  widthError      = '';
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
  fabricCode:        string = '';

  // Wind Sensor
  windSensorOptions:  OptionLookupDto[] = [];
  selectedWindSensor: string = '';

  // RAL / Frame Colour
  includeRalSurcharge     = false;
  hasRalSurcharge         = false;
  hasFrameColour          = false;
  frameColourOptions:     FrameColourOption[] = [];
  selectedRalType:        '' | 'standard' | 'nonstandard' = '';
  ralCustomCode           = '';
  selectedFrameColourId:  number | null = null;
  frameColourDropdownOpen = false;

  // Corrosion Protection
  includeCorrosionProtection = false;
  corrosionProtectionPrice   = 0;

  // Over 50 km
  over50Km = false;

  // ShadePlus
  includeShadeplus     = false;
  hasShadePlus         = false;
  shadePlusHasMultiple = false;
  shadePlusAllRows: { shadePlusId: number; description: string; widthCm: number; price: number }[] = [];
  shadePlusOptions: { shadePlusId: number; description: string; price: number }[] = [];
  selectedShadePlusId: number | null = null;
  selectedShadePlusDescription = '';

  // Valance Style
  includeValanceStyle  = false;
  hasValanceStyle      = false;
  selectedValanceType  = '';

  // Wall Sealing
  includeWallSealing = false;
  hasWallSealing     = false;

  // ── Quote-level discount ──────────────────────────────────────────────────
  discountType:  string = '';
  discountValue: number = 0;

  // ── Saved quotes (localStorage) ──────────────────────────────────────────
  savedQuotes: SavedQuote[] = [];
  private readonly STORAGE_KEY = 'quick_calculator_saved_quotes';

  private destroy$ = new Subject<void>();

  constructor(
    private workflowService:     WorkflowService,
    private pdfService:          PdfGenerationService,
    private optionLookupService: OptionLookupService
  ) {}

  ngOnInit() {
    this.initializeObservables();
    this.loadSuppliers();
    this.loadWindSensorOptions();
    this.loadSavedQuotes();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      this.bracketDropdownOpen     = false;
      this.frameColourDropdownOpen = false;
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

  private loadWindSensorOptions() {
    this.optionLookupService.getByCategory('WindSensor')
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(opts => { this.windSensorOptions = opts; });
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
    return floor ?? null;
  }

  private loadProductAddons() {
    if (!this.selectedProductId) return;
    const id = this.selectedProductId;

    // Reset availability flags so stale data from prior product doesn't linger
    this.hasRalSurcharge      = false;
    this.hasFrameColour       = false;
    this.frameColourOptions   = [];
    this.selectedFrameColourId = null;
    this.frameColourDropdownOpen = false;
    this.removeAddonItem('framecolour');
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

    this.workflowService.hasFrameColour(id)
      .pipe(takeUntil(this.destroy$)).subscribe(v => {
        this.hasFrameColour = v;
        if (v) {
          this.workflowService.getFrameColourOptions(id)
            .pipe(takeUntil(this.destroy$), catchError(() => of([])))
            .subscribe(opts => { this.frameColourOptions = opts; });
        }
      });

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
            .subscribe(brackets => {
              this.bracketsSubject$.next(brackets);
              if (this.selectedBrackets.length === 0) {
                const defaultBracket = brackets.find(b => b.isDefault);
                if (defaultBracket) {
                  this.selectedBrackets = [defaultBracket.bracketName];
                }
              }
              this.onBracketChange();
            });
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
            const defaultBracket = brackets.find(b => b.isDefault);
            if (defaultBracket) {
              this.selectedBrackets = [defaultBracket.bracketName];
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
            const defaultMotor = motors.find(m => {
              const d = m.description.toLowerCase();
              return d.includes('radio-contr') && d.includes('1 ch') && !d.includes('manual override');
            });
            if (defaultMotor) {
              this.selectedMotor = defaultMotor.motorId.toString();
              this.onMotorChange();
            }
          }
        });
    }
  }

  // ── Dimension handlers ────────────────────────────────────────────────────

  onWidthInput() {
    if (!this.enteredWidthCm || this.enteredWidthCm <= 0) {
      this.selectedWidthCm = null;
      this.widthError = '';
      return;
    }

    const widths = this._standardWidths;
    if (widths.length) {
      const sorted = [...widths].sort((a, b) => a - b);
      const minW = sorted[0];
      const maxW = sorted[sorted.length - 1];

      if (this.enteredWidthCm > maxW) {
        this.widthError = `Width ${this.enteredWidthCm}cm exceeds the maximum of ${maxW}cm (${(maxW / 100).toFixed(0)}m).`;
        this.selectedWidthCm = null;
        this.dimensionError = '';
        this.removeFirstDimensionLineItem();
        return;
      }

      if (this.enteredWidthCm < minW) {
        this.widthError = `Width ${this.enteredWidthCm}cm is below the minimum of ${minW}cm (${(minW / 100).toFixed(0)}m).`;
        this.selectedWidthCm = null;
        this.dimensionError = '';
        this.removeFirstDimensionLineItem();
        return;
      }
    }

    this.widthError = '';
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
    const projcm = this.selectedAwning;
    this.workflowService.getProjectionPriceForProduct(this.selectedProductId, this.selectedWidthCm, projcm)
      .pipe(takeUntil(this.destroy$), catchError(() => of(0)))
      .subscribe(price => {
        if (!price || price <= 0) {
          const wm = (this.enteredWidthCm! / 100).toFixed(2).replace(/\.?0+$/, '');
          const pm = (projcm / 100).toFixed(0);
          this.dimensionError =
            `No pricing found for ${wm}m wide × ${pm}m projection. ` +
            `This combination is not available — please choose a different width or projection.`;
          this.calculatedPrice = 0;
          this.removeFirstDimensionLineItem();
        } else {
          this.dimensionError = '';
          this.calculatedPrice = price;
          this.generateFirstLineItem();
        }
      });
  }

  private removeFirstDimensionLineItem() {
    const current = this.calculatorItemsSubject$.value;
    if (current.length > 0 && current[0].description.includes('wide x')) {
      this.calculatorItemsSubject$.next(current.slice(1));
    }
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
    if (this.selectedBrackets.length === 1) return this.stripSurchargePrefix(this.selectedBrackets[0]);
    return `${this.selectedBrackets.length} brackets selected`;
  }

  stripSurchargePrefix(name: string): string {
    return name.replace(/^surcharge for\s*/i, '');
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
      const price = b.isPriceIgnored ? 0 : b.price;
      const item = this.makeItem(b.bracketName, 1, price, 200000 + b.bracketId);
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

  get filteredFrameColourOptions(): FrameColourOption[] {
    if (!this.selectedRalType) return this.frameColourOptions;
    return this.frameColourOptions.filter(o => {
      const v = o.isNonStandardRAL as unknown;
      const isNonStd = v === true || v === 1 || v === '1';
      return this.selectedRalType === 'nonstandard' ? isNonStd : !isNonStd;
    });
  }

  onRalTypeChange() {
    this.selectedFrameColourId   = null;
    this.frameColourDropdownOpen = false;
    this.ralCustomCode           = '';
    this.removeAddonItem('ral');
    this.removeAddonItem('framecolour');
  }

  onRalCustomCodeChange() {
    if (this.selectedFrameColourId === null) return;
    const opt = this.frameColourOptions.find(o => o.frameColourOptionId === this.selectedFrameColourId);
    if (!opt) return;
    const items = this.calculatorItemsSubject$.value;
    const idx = items.findIndex(i => i.id === this.getAddonItemId('framecolour'));
    if (idx !== -1) {
      const desc = this.ralCustomCode
        ? `Frame Colour - ${opt.description} (${this.ralCustomCode})`
        : `Frame Colour - ${opt.description}`;
      items[idx] = { ...items[idx], description: desc };
      this.calculatorItemsSubject$.next([...items]);
    }
  }

  onFrameColourChange() {
    const opt = this.frameColourOptions.find(o => o.frameColourOptionId === this.selectedFrameColourId);
    if (!opt) { this.removeAddonItem('framecolour'); return; }
    const desc = this.ralCustomCode
      ? `Frame Colour - ${opt.description} (${this.ralCustomCode})`
      : `Frame Colour - ${opt.description}`;
    const addLine = (price: number) => {
      this.addOrUpdateAddonItem('framecolour', this.makeItem(desc, 1, price, this.getAddonItemId('framecolour')));
    };
    if (this.selectedRalType === 'standard') { addLine(0); return; }
    if (!this.selectedProductId || !this.selectedWidthCm) return;
    this.workflowService.getNonStandardRALColourPrice(this.selectedProductId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => addLine(price));
  }

  toggleFrameColourDropdown() { this.frameColourDropdownOpen = !this.frameColourDropdownOpen; }

  selectFrameColour(opt: FrameColourOption) {
    this.selectedFrameColourId   = opt.frameColourOptionId;
    this.frameColourDropdownOpen = false;
    this.onFrameColourChange();
  }

  getFrameColourLabel(): string {
    if (!this.selectedFrameColourId) return 'Select colour';
    return this.frameColourOptions.find(o => o.frameColourOptionId === this.selectedFrameColourId)?.description ?? 'Select colour';
  }

  getFrameColourCss(description: string): string {
    const n = description.toLowerCase();
    if (n.includes('anthracite'))                              return '#383E42';
    if (n.includes('black'))                                   return '#1C1C1C';
    if (n.includes('dark grey') || n.includes('dark gray'))    return '#5A5A5A';
    if (n.includes('grey') || n.includes('gray'))              return '#9E9E9E';
    if (n.includes('silver'))                                  return '#C0C0C0';
    if (n.includes('light grey') || n.includes('light gray'))  return '#D3D3D3';
    if (n.includes('white'))                                   return '#F2F2F2';
    if (n.includes('cream') || n.includes('ivory'))            return '#F5F0D0';
    if (n.includes('beige'))                                   return '#C8B89A';
    if (n.includes('sand'))                                    return '#D4BC8A';
    if (n.includes('bronze'))                                  return '#8C6B3E';
    if (n.includes('brown'))                                   return '#6B3A2A';
    if (n.includes('terracotta'))                              return '#C75B39';
    if (n.includes('green'))                                   return '#3A5F3A';
    if (n.includes('blue'))                                    return '#2B4F7A';
    if (n.includes('red'))                                     return '#B22222';
    return '#888888';
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
    if (!this.includeValanceStyle) { this.removeAddonItem('valance'); this.selectedValanceType = ''; return; }
    if (!this.selectedValanceType || !this.selectedProductId || !this.selectedWidthCm) return;
    this.workflowService.getValanceStylePrice(this.selectedProductId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => this.addOrUpdateAddonItem('valance',
        this.makeItem(`Valance Style ${this.selectedValanceType}`, 1, price, this.getAddonItemId('valance'))));
  }

  onValanceTypeChange() {
    if (this.includeValanceStyle && this.selectedValanceType) this.onValanceStyleChange();
  }

  onWallSealingChange() {
    if (!this.includeWallSealing) { this.removeAddonItem('wallsealing'); return; }
    if (!this.selectedProductId || !this.selectedWidthCm) return;
    this.workflowService.getWallSealingProfilePrice(this.selectedProductId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => this.addOrUpdateAddonItem('wallsealing',
        this.makeItem('Wall Sealing Profile', 1, price, this.getAddonItemId('wallsealing'))));
  }

  onWindSensorChange() {
    if (!this.selectedWindSensor || this.selectedWindSensor === 'No') {
      this.removeAddonItem('windsensor'); return;
    }
    const option = this.windSensorOptions.find(o => o.value === this.selectedWindSensor);
    if (!option) return;
    this.addOrUpdateAddonItem('windsensor',
      this.makeItem(`Wind Sensor - ${option.label}`, 1, option.price ?? 0, this.getAddonItemId('windsensor')));
  }

  onCorrosionProtectionChange() {
    if (!this.includeCorrosionProtection || this.corrosionProtectionPrice <= 0) {
      this.removeAddonItem('corrosionprotection'); return;
    }
    this.addOrUpdateAddonItem('corrosionprotection',
      this.makeItem('Corrosion Protection', 1, this.corrosionProtectionPrice, this.getAddonItemId('corrosionprotection')));
  }

  onOver50KmChange() {
    if (!this.over50Km) { this.removeAddonItem('over50km'); return; }
    this.addOrUpdateAddonItem('over50km',
      this.makeItem('Travel Surcharge - Over 50km', 1, 350, this.getAddonItemId('over50km')));
  }

  onFabricCodeChange() {
    if (!this.fabricCode.trim()) { this.removeAddonItem('fabriccode'); return; }
    this.addOrUpdateAddonItem('fabriccode',
      this.makeItem(`Fabric Code: ${this.fabricCode.trim()}`, 1, 0, this.getAddonItemId('fabriccode')));
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
      quoteNumber:        'ESTIMATE-' + (10000 + Math.floor(Math.random() * 90000)),
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
    this.extrasDescription         = '';
    this.extrasPrice               = 0;
    this.fabricCode                = '';
    this.selectedWindSensor        = '';
    this.includeCorrosionProtection = false;
    this.corrosionProtectionPrice  = 0;
    this.over50Km                  = false;
    this.includeRalSurcharge       = false;
    this.selectedRalType           = '';
    this.ralCustomCode             = '';
    this.selectedFrameColourId     = null;
    this.frameColourDropdownOpen   = false;
    this.includeShadeplus          = false;
    this.includeValanceStyle       = false;
    this.selectedValanceType       = '';
    this.includeWallSealing        = false;
    this.discountType              = '';
    this.discountValue             = 0;
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
      lighting: 100011, control: 100012, framecolour: 100013,
      windsensor: 100014, corrosionprotection: 100015, over50km: 100016, fabriccode: 100017
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
    const order = [
      'bracket', 'arm', 'motor', 'heater', 'electrician', 'installation',
      'ral', 'shadeplus', 'valance', 'wallsealing', 'lighting', 'control',
      'framecolour', 'windsensor', 'corrosionprotection', 'over50km', 'fabriccode'
    ];
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

  private getFollowUpDate(from?: Date): string {
    const d = from ? new Date(from) : new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  }

  // ── Saved Quotes ──────────────────────────────────────────────────────────

  loadSavedQuotes() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this.savedQuotes = raw ? JSON.parse(raw) : [];
    } catch {
      this.savedQuotes = [];
    }
  }

  private persistSavedQuotes() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.savedQuotes));
  }

  private calcTotals(items: CalculatorItem[], discountType: string, discountValue: number, vatRate: number) {
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const itemDisc = items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.discountPercentage / 100), 0);
    const base = subtotal - itemDisc;
    let quoteDisc = 0;
    if (discountType && discountValue > 0) {
      quoteDisc = discountType === 'Percentage' ? base * (discountValue / 100) : Math.min(discountValue, base);
    }
    const itemTax = items.reduce((s, i) => {
      return s + i.quantity * i.unitPrice * (1 - i.discountPercentage / 100) * (i.taxRate / 100);
    }, 0);
    const ratio = base > 0 ? (1 - quoteDisc / base) : 1;
    const totalTax = itemTax * ratio;
    return { subtotal, itemDisc, quoteDisc, totalTax, total: subtotal - itemDisc - quoteDisc + totalTax };
  }

  saveCurrentQuote() {
    const items = this.calculatorItemsSubject$.value;
    if (items.length === 0) return;
    const now = new Date();
    const { subtotal, total } = this.calcTotals(items, this.discountType, this.discountValue, this.vatRate);
    const saved: SavedQuote = {
      id:            now.getTime().toString(),
      name:          `${this.selectedProductName || 'Estimate'} — ${now.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      savedAt:       now.toISOString(),
      productName:   this.selectedProductName,
      items:         items.map(i => ({ ...i })),
      subtotal,
      totalAmount:   total,
      discountType:  this.discountType,
      discountValue: this.discountValue,
      vatRate:       this.vatRate
    };
    this.savedQuotes = [saved, ...this.savedQuotes];
    this.persistSavedQuotes();
  }

  deleteSavedQuote(id: string) {
    this.savedQuotes = this.savedQuotes.filter(q => q.id !== id);
    this.persistSavedQuotes();
  }

  loadSavedQuote(sq: SavedQuote) {
    this.calculatorItemsSubject$.next(sq.items.map(i => ({ ...i })));
    this.discountType  = sq.discountType;
    this.discountValue = sq.discountValue;
    this.onDiscountChange();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  downloadSavedQuotePdf(sq: SavedQuote) {
    const { subtotal, itemDisc, quoteDisc, totalTax, total } =
      this.calcTotals(sq.items, sq.discountType, sq.discountValue, sq.vatRate);
    this.pdfService.generateQuotePdf({
      quoteNumber:        'ESTIMATE-' + sq.id.slice(-5),
      quoteDate:          new Date(sq.savedAt).toLocaleDateString('en-GB'),
      expiryDate:         this.getFollowUpDate(new Date(sq.savedAt)),
      customerName:       'Phone Enquiry',
      customerAddress:    '',
      customerCity:       '',
      customerPostalCode: '',
      reference:          sq.productName || 'Quick Estimate',
      items: sq.items.map(i => ({
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        tax:         i.taxRate,
        amount:      i.amount
      })),
      subtotal,
      discount:  itemDisc + quoteDisc > 0 ? itemDisc + quoteDisc : undefined,
      totalTax,
      taxRate:   sq.vatRate,
      total,
      terms: 'This is an estimate only. Final quote subject to site survey.'
    });
  }
}
