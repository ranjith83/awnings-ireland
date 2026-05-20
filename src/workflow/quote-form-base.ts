import { Directive, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject, Observable, Subject, combineLatest,
  takeUntil, tap, catchError, of, finalize
} from 'rxjs';
import { map } from 'rxjs/operators';

import {
  WorkflowService,
  FrameColourOption,
  SupplierDto,
  WorkflowDto,
  MotorDto,
  HeaterDto,
  BracketDto,
  LightingCassetteDto,
  ControlDto
} from '../service/workflow.service';
import { ProductItemType, QuoteDto } from '../service/create-quote.service';
import { NotificationService } from '../service/notification.service';
import { OptionLookupService, OptionLookupDto } from '../service/option-lookup.service';
import {
  ADDON_ITEM_IDS, ADDON_SLOT, ADDON_SLOT_ORDER, AddonSlot,
  QUOTE_BRACKET_ID_OFFSET, QUOTE_ELECTRICIAN_PRICE, QUOTE_VAT_RATE,
} from './quote.constants';

export interface QuoteItemDisplay {
  id?: number;            // client-side marker for addon slot management
  productItemId?: number; // matches ProductItems.Id in the backend DB
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercentage: number;
  amount: number;
}

@Directive()
export abstract class QuoteFormBase implements OnDestroy {

  // ── Constants ──────────────────────────────────────────────────────────────
  readonly vatRate          = QUOTE_VAT_RATE;
  readonly electricianPrice = QUOTE_ELECTRICIAN_PRICE;

  // ── BehaviorSubjects ───────────────────────────────────────────────────────
  protected workflowsSubject$         = new BehaviorSubject<WorkflowDto[]>([]);
  protected suppliersSubject$         = new BehaviorSubject<SupplierDto[]>([]);
  protected bracketsSubject$          = new BehaviorSubject<BracketDto[]>([]);
  protected motorsSubject$            = new BehaviorSubject<MotorDto[]>([]);
  protected heatersSubject$           = new BehaviorSubject<HeaterDto[]>([]);
  protected lightingCassettesSubject$ = new BehaviorSubject<LightingCassetteDto[]>([]);
  protected controlsSubject$          = new BehaviorSubject<ControlDto[]>([]);
  protected widthsSubject$            = new BehaviorSubject<number[]>([]);
  protected projectionsSubject$       = new BehaviorSubject<number[]>([]);
  protected quoteItemsSubject$        = new BehaviorSubject<QuoteItemDisplay[]>([]);
  protected draftQuotesSubject$       = new BehaviorSubject<QuoteDto[]>([]);
  protected finalQuotesSubject$       = new BehaviorSubject<QuoteDto[]>([]);

  // ── Derived Observables ────────────────────────────────────────────────────
  workflows$!: Observable<WorkflowDto[]>;
  suppliers$!: Observable<SupplierDto[]>;
  brackets$!: Observable<BracketDto[]>;
  uniqueBrackets$!: Observable<BracketDto[]>;
  motors$!: Observable<MotorDto[]>;
  heaters$!: Observable<HeaterDto[]>;
  lightingCassettes$!: Observable<LightingCassetteDto[]>;
  controls$!: Observable<ControlDto[]>;
  availableWidths$!: Observable<number[]>;
  availableProjections$!: Observable<number[]>;
  quoteItems$!: Observable<QuoteItemDisplay[]>;
  draftQuotes$!: Observable<QuoteDto[]>;
  finalQuotes$!: Observable<QuoteDto[]>;
  subtotal$!: Observable<number>;
  quoteDiscount$!: Observable<number>;
  totalTax$!: Observable<number>;
  totalAmount$!: Observable<number>;
  isFormValid$!: Observable<boolean>;

  // ── Loading subjects ───────────────────────────────────────────────────────
  isLoading$       = new BehaviorSubject<boolean>(false);
  isLoadingQuotes$ = new BehaviorSubject<boolean>(false);
  isSendingEmail$  = new BehaviorSubject<boolean>(false);

  // ── Customer / workflow context ────────────────────────────────────────────
  workflowId: number | null = null;
  customerId: number | null = null;
  customerName       = '';
  customerEmail      = '';
  customerAddress    = '';
  customerCity       = '';
  customerPostalCode = '';

  // ── Selection bindings ─────────────────────────────────────────────────────
  selectedWorkflowId: number | null = null;
  selectedSupplierId: number | null = null;
  selectedModelId: number | null    = null;
  enteredWidthCm: number | null     = null;
  selectedWidthCm: number | null    = null;
  selectedAwning: number | null     = null;
  selectedProductName               = '';
  calculatedPrice                   = 0;
  dimensionError                    = '';
  widthError                        = '';

  // ── Quote metadata ─────────────────────────────────────────────────────────
  quoteDate    = new Date().toISOString().split('T')[0];
  followUpDate = this.getDefaultFollowUpDate();
  notes        = '';
  terms        = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';

  // ── Discount ───────────────────────────────────────────────────────────────
  discountType  = '';
  discountValue = 0;

  // ── Email flags ────────────────────────────────────────────────────────────
  emailToCustomer = false;
  includeBrochure = false;

  // ── Dropdown state ─────────────────────────────────────────────────────────
  bracketDropdownOpen     = false;
  frameColourDropdownOpen = false;

  // ── Addon selections ───────────────────────────────────────────────────────
  installationFee            = 0;
  selectedBrackets           : string[] = [];
  selectedMotor              = '';
  selectedHeater             = '';
  selectedLightingCassette   = '';
  selectedControl            = '';
  includeElectrician         = false;

  includeRalSurcharge  = false;

  includeShadeplus  = false;
  shadePlusAllRows: { shadePlusId: number; description: string; widthCm: number; price: number }[] = [];
  shadePlusOptions: { shadePlusId: number; description: string; price: number }[] = [];
  shadePlusHasMultiple       = false;
  selectedShadePlusId: number | null = null;
  selectedShadePlusDescription      = '';

  includeValanceStyle  = false;
  selectedValanceType  = '';
  includeWallSealing   = false;

  frameColourOptions:    FrameColourOption[] = [];
  selectedFrameColourId: number | null       = null;

  // ── Addon availability flags ───────────────────────────────────────────────
  hasRalSurcharge  = false;
  hasShadePlus     = false;
  hasValanceStyle  = false;
  hasWallSealing   = false;
  hasFrameColour   = false;

  // ── Extras ────────────────────────────────────────────────────────────────
  extrasDescription = '';
  extrasPrice       = 0;

  // ── Wind Sensor ───────────────────────────────────────────────────────────
  windSensorOptions: OptionLookupDto[] = [];
  selectedWindSensor = '';

  private optionLookupService = inject(OptionLookupService);

  protected destroy$ = new Subject<void>();

  constructor(
    protected workflowService: WorkflowService,
    protected notificationService: NotificationService,
    protected cdr: ChangeDetectorRef,
    protected router: Router
  ) {
    this.initObservables();
    this.loadWindSensorOptions();
  }

  // ── Observable setup ───────────────────────────────────────────────────────

  protected initObservables() {
    this.workflows$          = this.workflowsSubject$.asObservable();
    this.suppliers$          = this.suppliersSubject$.asObservable();
    this.brackets$           = this.bracketsSubject$.asObservable();
    this.uniqueBrackets$     = this.brackets$.pipe(
      map(brackets => {
        const seen = new Set<string>();
        return brackets.filter(b => {
          if (seen.has(b.bracketName)) return false;
          seen.add(b.bracketName);
          return true;
        });
      })
    );
    this.motors$             = this.motorsSubject$.asObservable();
    this.heaters$            = this.heatersSubject$.asObservable();
    this.lightingCassettes$  = this.lightingCassettesSubject$.asObservable();
    this.controls$           = this.controlsSubject$.asObservable();
    this.availableWidths$    = this.widthsSubject$.asObservable();
    this.availableProjections$ = this.projectionsSubject$.asObservable();
    this.quoteItems$         = this.quoteItemsSubject$.asObservable();
    this.draftQuotes$        = this.draftQuotesSubject$.asObservable();
    this.finalQuotes$        = this.finalQuotesSubject$.asObservable();

    this.subtotal$ = this.quoteItems$.pipe(
      map(items => items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0))
    );

    this.quoteDiscount$ = this.subtotal$.pipe(
      map(subtotal => {
        if (!this.discountType || this.discountValue <= 0) return 0;
        if (this.discountType === 'Percentage') return subtotal * (this.discountValue / 100);
        if (this.discountType === 'Fixed')      return this.discountValue;
        return 0;
      })
    );

    this.totalTax$ = combineLatest([this.quoteItems$, this.quoteDiscount$, this.subtotal$]).pipe(
      map(([items, quoteDiscount, subtotal]) => {
        const itemLevelTax = items.reduce((sum, item) => {
          const disc = item?.discountPercentage || 0;
          const tax  = item?.taxRate            || 0;
          const sub  = item.quantity * item.unitPrice;
          return sum + ((sub - sub * (disc / 100)) * (tax / 100));
        }, 0);

        const itemLevelDiscount = items.reduce((sum, i) =>
          sum + (i.quantity * i.unitPrice * (i.discountPercentage / 100)), 0);
        const afterItemDisc = subtotal - itemLevelDiscount;

        if (quoteDiscount > 0 && afterItemDisc > 0) {
          return itemLevelTax * (1 - quoteDiscount / afterItemDisc);
        }
        return itemLevelTax;
      })
    );

    this.totalAmount$ = combineLatest([
      this.subtotal$, this.quoteDiscount$, this.totalTax$, this.quoteItems$
    ]).pipe(
      map(([subtotal, quoteDiscount, tax, items]) => {
        const itemLevelDiscount = items.reduce((sum, i) =>
          sum + (i.quantity * i.unitPrice * (i.discountPercentage / 100)), 0);
        return subtotal - itemLevelDiscount - quoteDiscount + tax;
      })
    );

    this.isFormValid$ = this.quoteItems$.pipe(
      map(items => {
        if (!this.workflowId || !this.customerId) return false;
        if (items.length === 0) return false;
        return items.every(item =>
          item.description.trim() !== '' && item.quantity > 0 && item.unitPrice >= 0
        );
      })
    );
  }

  // ── Abstract methods ───────────────────────────────────────────────────────

  protected abstract loadExistingQuotes(workflowId: number): void;
  abstract resetFormPartial(): void;

  // ── Loaders ────────────────────────────────────────────────────────────────

  private loadWindSensorOptions() {
    this.optionLookupService.getByCategory('WindSensor')
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(opts => { this.windSensorOptions = opts; this.cdr.markForCheck(); });
  }

  onWindSensorChange() {
    if (!this.selectedWindSensor || this.selectedWindSensor === 'No') {
      this.removeAddonLineItem(ADDON_SLOT.WINDSENSOR);
      return;
    }
    const option = this.windSensorOptions.find(o => o.value === this.selectedWindSensor);
    if (!option) return;
    const price = option.price ?? 0;
    this.addOrUpdateAddonLineItem(ADDON_SLOT.WINDSENSOR, {
      description: `Wind Sensor - ${option.label}`,
      quantity: 1,
      unitPrice: price,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: this.calculateAmount(1, price, this.vatRate, 0),
      id: this.getAddonItemId(ADDON_SLOT.WINDSENSOR)
    });
  }

  protected loadSuppliers() {
    this.workflowService.getAllSuppliers()
      .pipe(
        takeUntil(this.destroy$),
        tap(s => this.suppliersSubject$.next(s)),
        catchError(() => { this.notificationService.error('Failed to load suppliers'); return of([]); })
      )
      .subscribe();
  }

  protected loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null) {
    if (!this.customerId) return;
    this.isLoading$.next(true);
    this.workflowService.getWorkflowsForCustomer(this.customerId)
      .pipe(
        takeUntil(this.destroy$),
        tap(workflows => {
          this.workflowsSubject$.next(workflows);
          if (preselectedWorkflowId && workflows.some(w => w.workflowId === preselectedWorkflowId)) {
            this.selectedWorkflowId = preselectedWorkflowId;
            this.workflowId = preselectedWorkflowId;
            this.onWorkflowChange();
            this.loadExistingQuotes(preselectedWorkflowId);
          } else if (workflows.length === 1) {
            this.selectedWorkflowId = workflows[0].workflowId;
            this.workflowId = workflows[0].workflowId;
            this.onWorkflowChange();
            this.loadExistingQuotes(workflows[0].workflowId);
          }
          this.cdr.markForCheck();
        }),
        catchError(() => { this.notificationService.error('Failed to load workflows'); return of([]); }),
        finalize(() => { this.isLoading$.next(false); this.cdr.markForCheck(); })
      )
      .subscribe();
  }

  // ── Workflow / product change handlers ─────────────────────────────────────

  onWorkflowChange() {
    if (!this.selectedWorkflowId) return;
    this.workflowId = this.selectedWorkflowId;
    const wf = this.workflowsSubject$.value.find(w => w.workflowId == this.selectedWorkflowId);
    if (wf) {
      this.selectedSupplierId  = wf.supplierId;
      this.selectedModelId     = wf.productId;
      this.selectedProductName = wf.productName;
      this.loadProductWidthsAndProjections();
      this.loadProductAddons();
      this.loadExistingQuotes(wf.workflowId);
    }
  }

  protected loadProductAddons() {
    if (!this.selectedModelId) return;
    const id = this.selectedModelId;

    // Reset availability flags so stale checkboxes from a prior product don't linger
    this.hasRalSurcharge     = false;
    this.hasShadePlus        = false;
    this.hasValanceStyle     = false;
    this.hasWallSealing      = false;
    this.hasFrameColour      = false;
    this.frameColourOptions  = [];
    this.selectedFrameColourId = null;
    this.removeAddonLineItem(ADDON_SLOT.FRAMECOLOUR);
    this.shadePlusOptions = [];
    this.shadePlusAllRows = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeShadeplus = false;
    this.removeAddonLineItem(ADDON_SLOT.SHADEPLUS);

    this.workflowService.hasNonStandardRALColours(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => this.hasRalSurcharge = v);

    this.workflowService.getShadePlusOptions(id, 0)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of({ hasMultiple: false, options: [] }))
      )
      .subscribe(result => {
        const opts = result.options ?? [];
        this.hasShadePlus         = opts.length > 0;
        this.shadePlusHasMultiple = result.hasMultiple;
        this.shadePlusAllRows = opts.map(o => ({
          shadePlusId: o.shadePlusId,
          description: o.description ?? '',
          widthCm: (o as any).widthCm ?? 0,
          price: o.price
        }));
        const seen = new Set<string>();
        this.shadePlusOptions = opts
          .filter(o => {
            const key = o.description ?? '';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(o => ({
            shadePlusId: o.shadePlusId,
            description: o.description ?? '',
            price: o.price
          }));
        if (this.shadePlusOptions.length > 0) {
          this.selectedShadePlusId = this.shadePlusOptions[0].shadePlusId;
          this.selectedShadePlusDescription = this.shadePlusOptions[0].description;
        }
      });

    this.workflowService.hasValanceStyles(id).pipe(takeUntil(this.destroy$)).subscribe(v => this.hasValanceStyle = v);
    this.workflowService.hasWallSealingProfiles(id).pipe(takeUntil(this.destroy$)).subscribe(v => this.hasWallSealing = v);
    this.workflowService.hasFrameColour(id).pipe(takeUntil(this.destroy$)).subscribe(v => {
      this.hasFrameColour = v;
      if (v && this.frameColourOptions.length === 0) {
        this.workflowService.getFrameColourOptions(id)
          .pipe(takeUntil(this.destroy$), catchError(() => of([])))
          .subscribe(opts => { this.frameColourOptions = opts; });
      }
    });

    this.reloadArmTypeDependents();
    this.workflowService.getHeatersForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.heatersSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getLightingCassettesForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.lightingCassettesSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getControlsForProduct(id).pipe(takeUntil(this.destroy$), tap(v => this.controlsSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  protected loadProductWidthsAndProjections() {
    if (!this.selectedModelId) return;
    const id = this.selectedModelId;
    this.workflowService.getStandardWidthsForProduct(id).pipe(takeUntil(this.destroy$), map(w => w.sort((a, b) => a - b)), tap(v => this.widthsSubject$.next(v)), catchError(() => of([]))).subscribe();
    this.workflowService.getProjectionWidthsForProduct(id).pipe(takeUntil(this.destroy$), map(p => p.sort((a, b) => a - b)), tap(v => this.projectionsSubject$.next(v)), catchError(() => of([]))).subscribe();
  }

  protected reloadArmTypeDependents() {
    if (!this.selectedModelId) return;
    const productId = this.selectedModelId;

    if (this.selectedWidthCm && this.selectedAwning) {
      this.workflowService.getArmTypeForProjection(productId, this.selectedWidthCm, this.selectedAwning)
        .pipe(
          takeUntil(this.destroy$),
          tap(armTypeId => {
            this.workflowService.getBracketsForProduct(productId, armTypeId)
              .pipe(
                takeUntil(this.destroy$),
                tap(brackets => {
                  this.bracketsSubject$.next(brackets);
                  if (this.selectedBrackets.length === 0) {
                    const defaultBracket = brackets.find(b => b.isDefault);
                    if (defaultBracket) {
                      this.selectedBrackets = [defaultBracket.bracketName];
                    }
                  }
                  this.onBracketChange();
                }),
                catchError(() => of([]))
              ).subscribe();

            this.workflowService.getMotorsForProduct(productId, armTypeId)
              .pipe(
                takeUntil(this.destroy$),
                tap(motors => {
                  this.motorsSubject$.next(motors);
                  if (this.selectedMotor && !motors.some(m => m.motorId.toString() === this.selectedMotor)) {
                    this.selectedMotor = '';
                    this.onMotorChange();
                  }
                }),
                catchError(() => of([]))
              ).subscribe();
          }),
          catchError(() => of(null))
        ).subscribe();
    } else {
      this.workflowService.getBracketsForProduct(productId, 1)
        .pipe(
          takeUntil(this.destroy$),
          tap(brackets => {
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
          }),
          catchError(() => of([]))
        ).subscribe();

      this.workflowService.getMotorsForProduct(productId, 1)
        .pipe(
          takeUntil(this.destroy$),
          tap(motors => {
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
          }),
          catchError(() => of([]))
        ).subscribe();
    }
  }

  // ── Width / awning handlers ────────────────────────────────────────────────

  onWidthInput() {
    if (!this.enteredWidthCm || String(Math.floor(Math.abs(this.enteredWidthCm))).length < 3) {
      this.selectedWidthCm = null;
      this.widthError = '';
      this.cdr.markForCheck();
      return;
    }

    const widths = this.widthsSubject$.value;
    if (widths.length) {
      const sorted = [...widths].sort((a, b) => a - b);
      const minW = sorted[0];
      const maxW = sorted[sorted.length - 1];

      if (this.enteredWidthCm > maxW) {
        this.widthError = `Width ${this.enteredWidthCm}cm exceeds the maximum of ${maxW}cm (${(maxW / 100).toFixed(0)}m).`;
        this.selectedWidthCm = null;
        this.dimensionError = '';
        this.removeFirstDimensionLineItem();
        this.cdr.markForCheck();
        return;
      }

      if (this.enteredWidthCm < minW) {
        this.widthError = `Width ${this.enteredWidthCm}cm is below the minimum of ${minW}cm (${(minW / 100).toFixed(0)}m).`;
        this.selectedWidthCm = null;
        this.dimensionError = '';
        this.removeFirstDimensionLineItem();
        this.cdr.markForCheck();
        return;
      }
    }

    this.widthError = '';
    this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
    if (this.includeShadeplus)               this.onShadeplusChange();
    if (this.includeValanceStyle)            this.onValanceStyleChange();
    if (this.includeWallSealing)             this.onWallSealingChange();
    if (this.selectedFrameColourId !== null) this.onFrameColourChange();
    this.cdr.markForCheck();
  }

  protected resolveCeilingWidth(entered: number | null): number | null {
    if (!entered || entered <= 0) return null;
    const widths = this.widthsSubject$.value;
    if (!widths.length) return null;
    const sorted = [...widths].sort((a, b) => a - b);
    const ceiling = sorted.find(w => w >= entered);
    return ceiling ?? null;
  }

  onAwningChange() {
    this.reloadArmTypeDependents();
    this.checkAndGenerateFirstLineItem();
  }

  protected checkAndGenerateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedWidthCm || !this.selectedAwning || !this.selectedModelId) return;
    const productId = this.selectedModelId;
    const widthcm   = this.selectedWidthCm;
    const projcm    = this.selectedAwning;

    this.workflowService.getProjectionPriceForProduct(productId, widthcm, projcm)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => { this.notificationService.error('Failed to retrieve pricing. Please try again.'); return of(0); })
      )
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
        this.cdr.markForCheck();
      });
  }

  protected removeFirstDimensionLineItem() {
    const current = this.quoteItemsSubject$.value;
    if (current.length > 0 && current[0].description.includes('wide x')) {
      this.quoteItemsSubject$.next(current.slice(1));
    }
  }

  protected generateFirstLineItem() {
    if (!this.enteredWidthCm || !this.selectedAwning || !this.selectedProductName) return;
    const widthM      = (this.enteredWidthCm / 100).toFixed(2).replace(/\.?0+$/, '') + 'm';
    const projectionM = (this.selectedAwning  / 100).toFixed(0) + 'm';
    const suffix      = (this.installationFee && this.installationFee > 0) ? 'Supply & Fit' : 'Supply Only';
    const description = `${this.selectedProductName} closed cassette awning ${widthM} wide x ${projectionM} projection ${suffix}`;
    const unitPrice   = this.calculatedPrice + (this.installationFee || 0);
    const item: QuoteItemDisplay = {
      description, quantity: 1, unitPrice,
      taxRate: this.vatRate, discountPercentage: 0,
      amount: this.calculateAmount(1, unitPrice, this.vatRate, 0)
    };
    const current = this.quoteItemsSubject$.value;
    if (current.length > 0 && current[0].description.includes('wide x')) {
      current[0] = item; this.quoteItemsSubject$.next([...current]);
    } else {
      this.quoteItemsSubject$.next([item, ...current]);
    }
  }

  // ── Addon handlers ─────────────────────────────────────────────────────────

  onBracketChange() {
    this.removeAllBracketLineItems();
    if (!this.selectedBrackets || this.selectedBrackets.length === 0) return;

    const allBrackets = this.bracketsSubject$.value;
    const seen = new Set<string>();
    const selected = allBrackets.filter(b => {
      if (!this.selectedBrackets.includes(b.bracketName)) return false;
      if (seen.has(b.bracketName)) return false;
      seen.add(b.bracketName);
      return true;
    });

    if (selected.length === 0) return;

    const items = this.quoteItemsSubject$.value;
    let insertIdx = 1;
    selected.forEach(b => {
      const price = b.isPriceIgnored ? 0 : b.price;
      const lineItem: QuoteItemDisplay = {
        description: b.bracketName, quantity: 1, unitPrice: price,
        taxRate: this.vatRate, discountPercentage: 0,
        amount: this.calculateAmount(1, price, this.vatRate, 0),
        id: QUOTE_BRACKET_ID_OFFSET + b.bracketId,
        productItemId: this.getAddonProductItemId(ADDON_SLOT.BRACKET)
      };
      items.splice(insertIdx, 0, lineItem);
      insertIdx++;
    });
    this.quoteItemsSubject$.next([...items]);
  }

  onExtrasChange() {
    if (!this.extrasDescription || this.extrasPrice <= 0) {
      this.removeAddonLineItem(ADDON_SLOT.ARM);
      return;
    }
    this.addOrUpdateAddonLineItem(ADDON_SLOT.ARM, {
      description: this.extrasDescription,
      quantity: 1,
      unitPrice: this.extrasPrice,
      taxRate: this.vatRate,
      discountPercentage: 0,
      amount: this.calculateAmount(1, this.extrasPrice, this.vatRate, 0),
      id: this.getAddonItemId(ADDON_SLOT.ARM)
    });
  }

  onRalSurchargeChange() {
    if (!this.includeRalSurcharge) {
      this.removeAddonLineItem(ADDON_SLOT.RAL);
      this.selectedFrameColourId   = null;
      this.frameColourDropdownOpen = false;
      this.removeAddonLineItem(ADDON_SLOT.FRAMECOLOUR);
    }
  }

  onShadeplusChange() {
    if (!this.includeShadeplus) { this.removeAddonLineItem(ADDON_SLOT.SHADEPLUS); return; }
    if (!this.selectedModelId || this.shadePlusOptions.length === 0) return;

    const chosen = this.shadePlusOptions.find(
      o => o.shadePlusId === this.selectedShadePlusId
    ) ?? this.shadePlusOptions[0];

    if (!chosen) return;

    this.selectedShadePlusId = chosen.shadePlusId;
    this.selectedShadePlusDescription = chosen.description;

    const lineDesc = this.shadePlusHasMultiple ? chosen.description : 'ShadePlus';

    const addItem = (price: number) => {
      this.addOrUpdateAddonLineItem(ADDON_SLOT.SHADEPLUS, {
        description: lineDesc,
        quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
        amount: this.calculateAmount(1, price, this.vatRate, 0),
        id: this.getAddonItemId(ADDON_SLOT.SHADEPLUS)
      });
    };

    if (this.selectedWidthCm) {
      const widthRow = this.shadePlusAllRows.find(
        r => r.description === chosen.description && r.widthCm === this.selectedWidthCm
      );
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

  onGridShadeplusDescriptionEdit(event: Event, _item: QuoteItemDisplay) {
    const newDesc = (event.target as HTMLInputElement).value;
    this.selectedShadePlusDescription = newDesc || 'ShadePlus';
    const items = this.quoteItemsSubject$.value;
    const idx = items.findIndex(i => i.id === ADDON_ITEM_IDS[ADDON_SLOT.SHADEPLUS]);
    if (idx !== -1) {
      items[idx] = { ...items[idx], description: this.selectedShadePlusDescription };
      this.quoteItemsSubject$.next([...items]);
      this.cdr.markForCheck();
    }
  }

  onShadeplusDescriptionEdit() {
    const items = this.quoteItemsSubject$.value;
    const idx = items.findIndex(i => i.id === ADDON_ITEM_IDS[ADDON_SLOT.SHADEPLUS]);
    if (idx !== -1) {
      items[idx] = { ...items[idx], description: this.selectedShadePlusDescription || 'ShadePlus' };
      this.quoteItemsSubject$.next([...items]);
      this.cdr.markForCheck();
    }
  }

  onValanceStyleChange() {
    if (!this.includeValanceStyle) { this.removeAddonLineItem(ADDON_SLOT.VALANCE); this.selectedValanceType = ''; return; }
    if (!this.selectedValanceType || !this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getValanceStylePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        this.addOrUpdateAddonLineItem(ADDON_SLOT.VALANCE, {
          description: 'Valance Style ' + this.selectedValanceType,
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          amount: this.calculateAmount(1, price, this.vatRate, 0),
          id: this.getAddonItemId(ADDON_SLOT.VALANCE)
        });
      });
  }

  onValanceTypeChange() {
    if (this.includeValanceStyle && this.selectedValanceType) this.onValanceStyleChange();
  }

  onWallSealingChange() {
    if (!this.includeWallSealing) { this.removeAddonLineItem(ADDON_SLOT.WALLSEALING); return; }
    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getWallSealingProfilePrice(this.selectedModelId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        this.addOrUpdateAddonLineItem(ADDON_SLOT.WALLSEALING, {
          description: 'Wall Sealing Profile',
          quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
          amount: this.calculateAmount(1, price, this.vatRate, 0),
          id: this.getAddonItemId(ADDON_SLOT.WALLSEALING)
        });
      });
  }

  onFrameColourChange() {
    const opt = this.frameColourOptions.find(o => o.frameColourOptionId === this.selectedFrameColourId);
    if (!opt) { this.removeAddonLineItem(ADDON_SLOT.FRAMECOLOUR); return; }

    if (!this.selectedModelId || !this.selectedWidthCm) return;
    this.workflowService.getFrameColourPrice(this.selectedModelId, opt.frameColourOptionId, this.selectedWidthCm)
      .pipe(takeUntil(this.destroy$))
      .subscribe(price => {
        if (price > 0) {
          this.addOrUpdateAddonLineItem(ADDON_SLOT.FRAMECOLOUR, {
            description: `Frame Colour - ${opt.description}`,
            quantity: 1, unitPrice: price, taxRate: this.vatRate, discountPercentage: 0,
            amount: this.calculateAmount(1, price, this.vatRate, 0),
            id: this.getAddonItemId(ADDON_SLOT.FRAMECOLOUR)
          });
        } else {
          this.removeAddonLineItem(ADDON_SLOT.FRAMECOLOUR);
        }
      });
  }

  onMotorChange() {
    if (!this.selectedMotor) { this.removeAddonLineItem(ADDON_SLOT.MOTOR); return; }
    const motor = this.motorsSubject$.value.find(m => m.motorId.toString() === this.selectedMotor);
    if (motor) this.addOrUpdateAddonLineItem(ADDON_SLOT.MOTOR, { description: motor.description, quantity: 1, unitPrice: motor.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, motor.price, this.vatRate, 0), id: this.getAddonItemId(ADDON_SLOT.MOTOR) });
  }

  onHeaterChange() {
    if (!this.selectedHeater) { this.removeAddonLineItem(ADDON_SLOT.HEATER); return; }
    const heater = this.heatersSubject$.value.find(h => h.heaterId.toString() === this.selectedHeater);
    if (heater) this.addOrUpdateAddonLineItem(ADDON_SLOT.HEATER, { description: heater.description, quantity: 1, unitPrice: heater.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, heater.price, this.vatRate, 0), id: this.getAddonItemId(ADDON_SLOT.HEATER) });
  }

  onLightingCassetteChange() {
    if (!this.selectedLightingCassette) { this.removeAddonLineItem(ADDON_SLOT.LIGHTING); return; }
    const cassette = this.lightingCassettesSubject$.value.find(c => c.lightingId.toString() === this.selectedLightingCassette);
    if (cassette) this.addOrUpdateAddonLineItem(ADDON_SLOT.LIGHTING, { description: cassette.description, quantity: 1, unitPrice: cassette.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, cassette.price, this.vatRate, 0), id: this.getAddonItemId(ADDON_SLOT.LIGHTING) });
  }

  onControlChange() {
    if (!this.selectedControl) { this.removeAddonLineItem(ADDON_SLOT.CONTROL); return; }
    const control = this.controlsSubject$.value.find(c => c.controlId.toString() === this.selectedControl);
    if (control) this.addOrUpdateAddonLineItem(ADDON_SLOT.CONTROL, { description: control.description, quantity: 1, unitPrice: control.price, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, control.price, this.vatRate, 0), id: this.getAddonItemId(ADDON_SLOT.CONTROL) });
  }

  onElectricianChange() {
    if (!this.includeElectrician) { this.removeAddonLineItem(ADDON_SLOT.ELECTRICIAN); return; }
    this.addOrUpdateAddonLineItem(ADDON_SLOT.ELECTRICIAN, { description: 'Electric connection by our Qualified Electrician', quantity: 1, unitPrice: this.electricianPrice, taxRate: this.vatRate, discountPercentage: 0, amount: this.calculateAmount(1, this.electricianPrice, this.vatRate, 0), id: this.getAddonItemId(ADDON_SLOT.ELECTRICIAN) });
  }

  onInstallationFeeChange() {
    this.removeAddonLineItem(ADDON_SLOT.INSTALLATION);
    this.generateFirstLineItem();
  }

  onDiscountChange() {
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  // ── Frame colour dropdown ──────────────────────────────────────────────────

  toggleFrameColourDropdown() { this.frameColourDropdownOpen = !this.frameColourDropdownOpen; }
  closeFrameColourDropdown()  { this.frameColourDropdownOpen = false; }

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
    if (n.includes('anthracite'))                             return '#383E42';
    if (n.includes('black'))                                  return '#1C1C1C';
    if (n.includes('dark grey') || n.includes('dark gray'))   return '#5A5A5A';
    if (n.includes('grey') || n.includes('gray'))             return '#9E9E9E';
    if (n.includes('silver'))                                 return '#C0C0C0';
    if (n.includes('light grey') || n.includes('light gray')) return '#D3D3D3';
    if (n.includes('white'))                                  return '#F2F2F2';
    if (n.includes('cream') || n.includes('ivory'))           return '#F5F0D0';
    if (n.includes('beige'))                                  return '#C8B89A';
    if (n.includes('sand'))                                   return '#D4BC8A';
    if (n.includes('bronze'))                                 return '#8C6B3E';
    if (n.includes('brown'))                                  return '#6B3A2A';
    if (n.includes('terracotta'))                             return '#C75B39';
    if (n.includes('green'))                                  return '#3A5F3A';
    if (n.includes('blue'))                                   return '#2B4F7A';
    if (n.includes('red'))                                    return '#B22222';
    return '#888888';
  }

  // ── Bracket dropdown ───────────────────────────────────────────────────────

  toggleBracketDropdown() { this.bracketDropdownOpen = !this.bracketDropdownOpen; }
  closeBracketDropdown()  { this.bracketDropdownOpen = false; }

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

  // ── Quote item grid helpers ────────────────────────────────────────────────

  addQuoteItem() {
    const items = this.quoteItemsSubject$.value;
    items.push({ description: '', quantity: 1, unitPrice: 0, taxRate: this.vatRate, discountPercentage: 0, amount: 0 });
    this.quoteItemsSubject$.next([...items]);
  }

  removeQuoteItem(index: number) {
    const items = this.quoteItemsSubject$.value;
    items.splice(index, 1);
    this.quoteItemsSubject$.next([...items]);
  }

  onQuantityChange(item: QuoteItemDisplay) {
    item.amount = this.calculateAmount(item.quantity, item.unitPrice, item.taxRate || 0, item.discountPercentage || 0);
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  onItemChange(item: QuoteItemDisplay) {
    item.amount = this.calculateAmount(item.quantity, item.unitPrice, item.taxRate || 0, item.discountPercentage || 0);
    this.quoteItemsSubject$.next([...this.quoteItemsSubject$.value]);
  }

  calculateItemAmount(item: QuoteItemDisplay): number {
    return this.calculateAmount(item.quantity, item.unitPrice, item.taxRate || 0, item.discountPercentage || 0);
  }

  // ── Calc grid helpers (operate on a persisted QuoteDto) ────────────────────

  calcSubTotal(q: QuoteDto): number {
    return (q.quoteItems || []).reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
  }

  calcQuoteDiscount(q: QuoteDto): number {
    if (!q.discountType || !q.discountValue || q.discountValue <= 0) return 0;
    const sub = this.calcSubTotal(q);
    return q.discountType === 'Percentage' ? sub * (q.discountValue / 100) : q.discountValue;
  }

  calcTax(q: QuoteDto): number {
    const items = q.quoteItems || [];
    const sub   = this.calcSubTotal(q);
    const itemLevelDiscount = items.reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    const itemLevelTax = items.reduce((s, i) => {
      const lineTotal = i.quantity * i.unitPrice;
      const disc = lineTotal * ((i.discountPercentage || 0) / 100);
      return s + ((lineTotal - disc) * ((i.taxRate || 0) / 100));
    }, 0);
    const afterItemDisc = sub - itemLevelDiscount;
    const quoteDisc = this.calcQuoteDiscount(q);
    if (quoteDisc > 0 && afterItemDisc > 0) {
      return itemLevelTax * (1 - quoteDisc / afterItemDisc);
    }
    return itemLevelTax;
  }

  calcTotal(q: QuoteDto): number {
    const itemLevelDiscount = (q.quoteItems || []).reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    return this.calcSubTotal(q) - itemLevelDiscount - this.calcQuoteDiscount(q) + this.calcTax(q);
  }

  // ── TrackBy functions ──────────────────────────────────────────────────────

  trackByQuoteId       = (_: number, q: QuoteDto)                      => q.quoteId;
  trackByWorkflowId    = (_: number, w: WorkflowDto)                   => w.workflowId;
  trackByBracketId     = (_: number, b: BracketDto)                    => b.bracketId;
  trackByMotorId       = (_: number, m: MotorDto)                      => m.motorId;
  trackByHeaterId      = (_: number, h: HeaterDto)                     => h.heaterId;
  trackByLightingId    = (_: number, c: LightingCassetteDto)           => c.lightingId;
  trackByControlId     = (_: number, c: ControlDto)                    => c.controlId;
  trackByShadePlusId   = (_: number, o: { shadePlusId: number })       => o.shadePlusId;
  trackByFrameColourId = (_: number, o: FrameColourOption)             => o.frameColourOptionId;
  trackByValue         = (_: number, v: number)                        => v;
  trackByItemId        = (i: number, item: QuoteItemDisplay)           => item.id ?? i;

  // ── Utilities ──────────────────────────────────────────────────────────────

  getDefaultFollowUpDate(): string {
    const d = new Date(); d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  }

  close() {
    this.router.navigate(['/workflow'], {
      queryParams: { customerId: this.customerId, customerName: this.customerName }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  protected calculateAmount(qty: number, price: number, _taxRate: number, discPct: number): number {
    const sub  = qty * price;
    const disc = sub * (discPct / 100);
    return sub - disc;
  }

  protected addOrUpdateAddonLineItem(slot: AddonSlot, lineItem: QuoteItemDisplay) {
    lineItem.productItemId = this.getAddonProductItemId(slot);
    const items = this.quoteItemsSubject$.value;
    const idx   = items.findIndex(i => i.id === lineItem.id);
    if (idx !== -1) { items[idx] = lineItem; this.quoteItemsSubject$.next([...items]); }
    else            { const at = this.getAddonInsertIndex(slot); items.splice(at, 0, lineItem); this.quoteItemsSubject$.next([...items]); }
    this.cdr.markForCheck();
  }

  protected removeAddonLineItem(slot: AddonSlot) {
    const id    = ADDON_ITEM_IDS[slot];
    const items = this.quoteItemsSubject$.value;
    const idx   = items.findIndex(i => i.id === id);
    if (idx !== -1) { items.splice(idx, 1); this.quoteItemsSubject$.next([...items]); this.cdr.markForCheck(); }
  }

  protected removeAllBracketLineItems() {
    const items    = this.quoteItemsSubject$.value;
    const filtered = items.filter(i => !i.id || i.id < QUOTE_BRACKET_ID_OFFSET);
    if (filtered.length !== items.length) { this.quoteItemsSubject$.next(filtered); this.cdr.markForCheck(); }
  }

  protected getAddonItemId(slot: AddonSlot): number {
    return ADDON_ITEM_IDS[slot];
  }

  protected getAddonProductItemId(slot: AddonSlot): number | undefined {
    const slotMap: Partial<Record<AddonSlot, ProductItemType>> = {
      [ADDON_SLOT.BRACKET]:     ProductItemType.Brackets,
      [ADDON_SLOT.MOTOR]:       ProductItemType.Motors,
      [ADDON_SLOT.VALANCE]:     ProductItemType.Valance,
      [ADDON_SLOT.RAL]:         ProductItemType.NonStandardRals,
      [ADDON_SLOT.SHADEPLUS]:   ProductItemType.ShadePlus,
      [ADDON_SLOT.LIGHTING]:    ProductItemType.LightingCassettes,
      [ADDON_SLOT.WALLSEALING]: ProductItemType.WallSealingProfile,
      [ADDON_SLOT.CONTROL]:     ProductItemType.Controls,
      [ADDON_SLOT.HEATER]:      ProductItemType.Heaters,
      [ADDON_SLOT.FRAMECOLOUR]: ProductItemType.FrameColour,
    };
    return slotMap[slot];
  }

  protected getAddonInsertIndex(slot: AddonSlot): number {
    const items = this.quoteItemsSubject$.value;
    let idx = 1;
    for (const s of ADDON_SLOT_ORDER) {
      if (s === slot) break;
      if (s === ADDON_SLOT.BRACKET) {
        idx += items.filter(item => item.id !== undefined && item.id >= QUOTE_BRACKET_ID_OFFSET).length;
      } else if (items.some(item => item.id === ADDON_ITEM_IDS[s])) {
        idx++;
      }
    }
    return idx;
  }
}
