import { Component, HostListener, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntil, tap, catchError, of, finalize } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';

import {
  CreateQuoteService,
  CreateFinalQuoteDto,
  QuoteDto,
  UpdateQuoteDto,
  UpdateQuoteItemDto,
  ProductItemType,
} from '../../service/create-quote.service';
import { WorkflowService } from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';
import { EmailTaskService, SendDirectEmailPayload, EmailAttachmentPayload } from '../../service/email-task.service';
import { NotificationService } from '../../service/notification.service';
import { QuoteFormBase, QuoteItemDisplay } from '../quote-form-base';
import { OptionLookupDto } from '../../service/option-lookup.service';

@Component({
  selector: 'app-final-quote',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './final-quote.component.html',
  styleUrls: [
    '../create-quote.component/create-quote.component.css',
    './final-quote.component.css'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinalQuoteComponent extends QuoteFormBase implements OnInit {

  // Re-declared so the Angular Language Service resolves them from the template.
  override windSensorOptions: OptionLookupDto[] = [];
  override selectedWindSensor = '';

  // ── Quote selection / edit state ───────────────────────────────────────────
  selectedDraftQuote: QuoteDto | null = null;
  editingFinalQuote: QuoteDto | null  = null;

  get linkedFinalQuotes(): QuoteDto[] {
    if (!this.selectedDraftQuote) return [];
    return this.finalQuotesSubject$.value.filter(
      fq => fq.draftQuoteId === this.selectedDraftQuote!.quoteId
    );
  }

  get showForm(): boolean {
    return (this.selectedDraftQuote !== null && this.linkedFinalQuotes.length === 0)
      || this.editingFinalQuote !== null;
  }

  constructor(
    private createQuoteService: CreateQuoteService,
    workflowService: WorkflowService,
    private workflowStateService: WorkflowStateService,
    private pdfService: PdfGenerationService,
    private emailTaskService: EmailTaskService,
    private route: ActivatedRoute,
    router: Router,
    notificationService: NotificationService,
    cdr: ChangeDetectorRef
  ) {
    super(workflowService, notificationService, cdr, router);
  }

  ngOnInit() {
    this.initializeComponent();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown'))       this.bracketDropdownOpen     = false;
    if (!target.closest('.frame-colour-dropdown')) this.frameColourDropdownOpen = false;
  }

  // ── Component init ─────────────────────────────────────────────────────────

  private initializeComponent() {
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId         = params['customerId']         ? +params['customerId']         : null;
        this.customerName       = params['customerName']       || '';
        this.customerEmail      = params['customerEmail']      || '';
        this.customerAddress    = params['customerAddress']    || '';
        this.customerCity       = params['customerCity']       || '';
        this.customerPostalCode = params['customerPostalCode'] || '';

        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        let workflowId = 0;

        if (!this.customerId) {
          this.notificationService.error('No customer selected. Please select a customer first.');
          return;
        }

        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        this.customerId   = selectedWorkflow?.customerId   || this.customerId;
        this.customerName = selectedWorkflow?.customerName || this.customerName;
        workflowId        = selectedWorkflow?.id           || paramWorkflowId || 0;

        this.loadWorkflowsForCustomer(workflowId);
        this.loadSuppliers();

        if (this.customerId && !this.customerEmail) this.resolveCustomerEmail(this.customerId);
      });
  }

  private resolveCustomerEmail(customerId: number) {
    this.emailTaskService.getTasksByCustomer(customerId)
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(tasks => {
        if (tasks.length && tasks[0].fromEmail) {
          this.customerEmail = tasks[0].fromEmail;
        }
      });
  }

  // ── Abstract method implementations ───────────────────────────────────────

  protected loadExistingQuotes(workflowId: number) {
    this.isLoadingQuotes$.next(true);
    this.createQuoteService.getQuotesByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(quotes => {
          this.draftQuotesSubject$.next(quotes.filter(q => !q.draftQuoteId));
          this.finalQuotesSubject$.next(quotes.filter(q => !!q.draftQuoteId));
        }),
        catchError(() => { this.notificationService.error('Failed to load existing quotes'); return of([]); }),
        finalize(() => this.isLoadingQuotes$.next(false))
      ).subscribe();
  }

  resetFormPartial() {
    this.quoteDate    = new Date().toISOString().split('T')[0];
    this.followUpDate = this.getDefaultFollowUpDate();
    this.notes        = '';
    this.terms        = 'Quote Valid for 60 days from date of issue.\nPrices based on site survey.';
    this.installationFee = 0;
    this.selectedBrackets = [];
    this.selectedMotor = '';
    this.selectedHeater = '';
    this.selectedLightingCassette = '';
    this.selectedControl = '';
    this.includeElectrician         = false;
    this.selectedRalType            = '';
    this.ralCustomCode              = '';
    this.selectedFrameColourId      = null;
    this.includeCorrosionProtection = false;
    this.corrosionProtectionPrice   = 0;
    this.over50Km                   = false;
    this.includeShadeplus           = false;
    this.shadePlusAllRows    = [];
    this.shadePlusOptions    = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeValanceStyle = false;
    this.selectedValanceType = '';
    this.includeWallSealing  = false;
    this.extrasDescription   = '';
    this.extrasPrice         = 0;
    this.selectedWindSensor  = '';
    this.enteredWidthCm      = null;
    this.selectedWidthCm     = null;
    this.selectedAwning      = null;
    this.discountType        = '';
    this.discountValue       = 0;
    this.editingFinalQuote   = null;
    this.quoteItemsSubject$.next([]);
    this.notificationService.success('');
  }

  // ── Width resolution (floor: largest standard ≤ entered) ──────────────────

  protected override resolveCeilingWidth(entered: number | null): number | null {
    if (!entered || entered <= 0) return null;
    const widths = this.widthsSubject$.value;
    if (!widths.length) return null;
    const sorted = [...widths].sort((a, b) => a - b);
    const floor = [...sorted].reverse().find(w => w <= entered);
    if (floor != null) return floor;
    return sorted[0];
  }

  // ── Draft quote selection ──────────────────────────────────────────────────

  selectDraftQuote(quote: QuoteDto) {
    this.selectedDraftQuote = quote;
    this.editingFinalQuote  = null;

    const hasLinked = !!quote.isFinal ||
      this.finalQuotesSubject$.value.some(fq => fq.draftQuoteId === quote.quoteId);

    if (!hasLinked) {
      this.populateFormFromQuote(quote);
    } else {
      this.quoteItemsSubject$.next([]);
      this.resetAddonCheckboxes();
    }
  }

  clearDraftSelection() {
    this.selectedDraftQuote = null;
    this.editingFinalQuote  = null;
    this.quoteItemsSubject$.next([]);
    this.discountType      = '';
    this.discountValue     = 0;
    this.enteredWidthCm    = null;
    this.selectedWidthCm   = null;
    this.selectedAwning    = null;
    this.extrasDescription = '';
    this.extrasPrice       = 0;
    this.installationFee   = 0;
    this.resetAddonCheckboxes();
  }

  // ── Final quote actions ────────────────────────────────────────────────────

  editFinalQuote(fq: QuoteDto) {
    this.editingFinalQuote = fq;
    this.populateFormFromQuote(fq);
  }

  deleteFinalQuote(fq: QuoteDto) {
    this.createQuoteService.deleteQuote(fq.quoteId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(() => {
        const remaining = this.finalQuotesSubject$.value.filter(q => q.quoteId !== fq.quoteId);
        this.finalQuotesSubject$.next(remaining);

        if (this.editingFinalQuote?.quoteId === fq.quoteId) {
          this.editingFinalQuote = null;
          this.quoteItemsSubject$.next([]);
          this.resetAddonCheckboxes();
        }
        this.notificationService.success(`Final Quote ${fq.quoteNumber} deleted.`);
        this.workflowStateService.notifyWorkflowChanged();
      });
  }

  regenerateFinalQuote(fq: QuoteDto) {
    this.downloadQuotePdf(fq);
  }

  // ── Form population ────────────────────────────────────────────────────────

  private populateFormFromQuote(quote: QuoteDto) {
    const parseDate = (d: string | Date): string =>
      typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
    this.quoteDate    = parseDate(quote.quoteDate);
    this.followUpDate = parseDate(quote.followUpDate);
    this.discountType  = quote.discountType  || '';
    this.discountValue = quote.discountValue || 0;

    // ── Parse width & projection from first line item description ──────────
    const firstItem = (quote.quoteItems || [])[0];
    if (firstItem) {
      const dimMatch = firstItem.description.match(/(\d+\.?\d*)m\s+wide\s+x\s+(\d+\.?\d*)m\s+projection/i);
      if (dimMatch) {
        this.enteredWidthCm  = Math.round(parseFloat(dimMatch[1]) * 100);
        this.selectedWidthCm = this.resolveCeilingWidth(this.enteredWidthCm);
        this.selectedAwning  = Math.round(parseFloat(dimMatch[2]) * 100);
        if (this.selectedModelId) {
          this.reloadArmTypeDependents();
        }
      }
    }

    // ── Populate line items ────────────────────────────────────────────────
    const displayItems: QuoteItemDisplay[] = (quote.quoteItems || []).map(qi => ({
      productItemId:      qi.productItemId,
      description:        qi.description,
      quantity:           qi.quantity,
      unitPrice:          qi.unitPrice,
      taxRate:            qi.taxRate,
      discountPercentage: qi.discountPercentage,
      amount:             this.calculateAmount(qi.quantity, qi.unitPrice, qi.taxRate, qi.discountPercentage)
    }));
    this.quoteItemsSubject$.next(displayItems);

    // ── Restore addon UI state using productItemId ─────────────────────────
    this.resetAddonCheckboxes();
    for (const qi of quote.quoteItems || []) {
      switch (qi.productItemId) {
        case ProductItemType.NonStandardRals:    this.selectedRalType = 'nonstandard'; break;
        case ProductItemType.ShadePlus:          this.includeShadeplus    = true; break;
        case ProductItemType.Valance: {
          this.includeValanceStyle = true;
          const m = qi.description.match(/Valance Style\s+(Straight|Wavey)/i);
          this.selectedValanceType = m ? m[1] : 'Straight';
          break;
        }
        case ProductItemType.WallSealingProfile: this.includeWallSealing  = true; break;
      }
      if (!qi.productItemId && qi.description.toLowerCase().includes('electrician')) {
        this.includeElectrician = true;
      }
    }

    // ── Match brackets by productItemId ───────────────────────────────────
    const bracketItems = (quote.quoteItems || []).filter(qi => qi.productItemId === ProductItemType.Brackets);
    if (bracketItems.length) {
      this.uniqueBrackets$.pipe(
        filter(brackets => brackets.length > 0), take(1), takeUntil(this.destroy$)
      ).subscribe(brackets => {
        const matched = brackets
          .filter(b => bracketItems.some(qi => qi.description.toLowerCase().includes(b.bracketName.toLowerCase())))
          .map(b => b.bracketName);
        if (matched.length) this.selectedBrackets = matched;
      });
    }

    // ── Match motor ────────────────────────────────────────────────────────
    const motorItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.Motors);
    if (motorItem) {
      this.motors$.pipe(filter(m => m.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(motors => {
          const m = motors.find(m => m.description === motorItem.description);
          if (m) this.selectedMotor = m.motorId.toString();
        });
    }

    // ── Match heater ───────────────────────────────────────────────────────
    const heaterItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.Heaters);
    if (heaterItem) {
      this.heaters$.pipe(filter(h => h.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(heaters => {
          const h = heaters.find(h => h.description === heaterItem.description);
          if (h) this.selectedHeater = h.heaterId.toString();
        });
    }

    // ── Match lighting cassette ────────────────────────────────────────────
    const lightingItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.LightingCassettes);
    if (lightingItem) {
      this.lightingCassettes$.pipe(filter(l => l.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(cassettes => {
          const c = cassettes.find(c => c.description === lightingItem.description);
          if (c) this.selectedLightingCassette = c.lightingId.toString();
        });
    }

    // ── Match control ──────────────────────────────────────────────────────
    const controlItem = (quote.quoteItems || []).find(qi => qi.productItemId === ProductItemType.Controls);
    if (controlItem) {
      this.controls$.pipe(filter(c => c.length > 0), take(1), takeUntil(this.destroy$))
        .subscribe(controls => {
          const c = controls.find(c => c.description === controlItem.description);
          if (c) this.selectedControl = c.controlId.toString();
        });
    }

    // ── Restore extras (free-text line item without productItemId) ─────────
    const extrasItem = (quote.quoteItems || []).find((qi, idx) =>
      idx > 0 && !qi.productItemId && !qi.description.toLowerCase().includes('electrician')
    );
    if (extrasItem) {
      this.extrasDescription = extrasItem.description;
      this.extrasPrice       = extrasItem.unitPrice;
    }

    // ── Restore installation fee — subtract base price from line item ──────
    const mainItem = (quote.quoteItems || [])[0];
    if (
      mainItem &&
      mainItem.description.toLowerCase().includes('supply & fit') &&
      this.selectedModelId && this.selectedWidthCm && this.selectedAwning
    ) {
      this.workflowService
        .getProjectionPriceForProduct(this.selectedModelId, this.selectedWidthCm, this.selectedAwning)
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe(basePrice => {
          const fee = Math.round((mainItem.unitPrice - basePrice) * 100) / 100;
          this.installationFee = fee > 0 ? fee : 0;
        });
    } else {
      this.installationFee = 0;
    }

    this.onDiscountChange();
  }

  // ── Submit (create or update) final quote ──────────────────────────────────

  submitFinalQuote() {
    const items = this.quoteItemsSubject$.value;
    if (!this.workflowId || !this.customerId || items.length === 0) {
      this.notificationService.error('Please select a draft quote and ensure at least one line item exists.');
      return;
    }
    if (this.editingFinalQuote) {
      this.updateExistingFinalQuote(items);
    } else {
      this.createNewFinalQuote(items);
    }
  }

  private createNewFinalQuote(items: QuoteItemDisplay[]) {
    if (!this.selectedDraftQuote?.quoteId) {
      this.notificationService.error('No draft quote selected.');
      return;
    }

    const dto: CreateFinalQuoteDto = {
      draftQuoteId:     this.selectedDraftQuote.quoteId,
      quoteDate:        this.quoteDate,
      followUpDate:     this.followUpDate,
      notes:            this.notes,
      terms:            this.terms,
      discountType:     this.discountType  || undefined,
      discountValue:    this.discountValue || 0,
      windSensorOption: this.selectedWindSensor || undefined,
      quoteItems: items.map(item => ({
        description:        item.description,
        quantity:           item.quantity,
        unitPrice:          item.unitPrice,
        taxRate:            item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0,
        productItemId:      item.productItemId
      }))
    };

    this.isLoading$.next(true);
    this.notificationService.error('');
    this.notificationService.success('');

    this.createQuoteService.createFinalQuote(dto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (newQuote) => {
          const finalQuote: QuoteDto = {
            ...newQuote,
            isFinal:      true,
            draftQuoteId: newQuote.draftQuoteId ?? this.selectedDraftQuote!.quoteId
          };
          this.finalQuotesSubject$.next([...this.finalQuotesSubject$.value, finalQuote]);

          if (this.selectedDraftQuote) {
            const updatedDraft = { ...this.selectedDraftQuote, isFinal: true };
            this.selectedDraftQuote = updatedDraft;
            this.draftQuotesSubject$.next(
              this.draftQuotesSubject$.value.map(d =>
                d.quoteId === updatedDraft.quoteId ? updatedDraft : d
              )
            );
          }

          this.notificationService.success(`Final Quote ${newQuote.quoteNumber} created successfully!`);
          this.workflowStateService.notifyStepCompleted('final-quote');

          const pdfBase64 = await this.generatePdf(newQuote);
          if (this.emailToCustomer) {
            this.sendQuoteEmail(newQuote, pdfBase64);
          }

          this.quoteItemsSubject$.next([]);
          this.resetAddonCheckboxes();
          this.discountType  = '';
          this.discountValue = 0;
        }),
        catchError(error => {
          this.notificationService.error(error.message || 'Error generating final quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  private updateExistingFinalQuote(items: QuoteItemDisplay[]) {
    const fq = this.editingFinalQuote!;
    const updateDto: UpdateQuoteDto = {
      quoteDate:     this.quoteDate,
      followUpDate:  this.followUpDate,
      notes:         this.notes,
      terms:         this.terms,
      discountType:  this.discountType  || undefined,
      discountValue: this.discountValue || undefined,
      quoteItems: items.map(item => ({
        description:        item.description,
        quantity:           item.quantity,
        unitPrice:          item.unitPrice,
        taxRate:            item.taxRate || this.vatRate,
        discountPercentage: item.discountPercentage || 0,
        productItemId:      item.productItemId
      })) as UpdateQuoteItemDto[]
    };

    this.isLoading$.next(true);
    this.notificationService.error('');
    this.notificationService.success('');

    this.createQuoteService.updateQuote(fq.quoteId, updateDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (updatedQuote) => {
          const enriched: QuoteDto = {
            ...updatedQuote,
            isFinal:      true,
            draftQuoteId: updatedQuote.draftQuoteId ?? fq.draftQuoteId
          };
          const updated = this.finalQuotesSubject$.value.map(q =>
            q.quoteId === enriched.quoteId ? enriched : q
          );
          this.finalQuotesSubject$.next(updated);
          this.editingFinalQuote = null;

          this.notificationService.success(`Final Quote FINAL-${updatedQuote.quoteNumber} updated successfully!`);

          const pdfBase64 = await this.generatePdf(updatedQuote);
          if (this.emailToCustomer) {
            this.sendQuoteEmail(updatedQuote, pdfBase64);
          }

          this.quoteItemsSubject$.next([]);
          this.resetAddonCheckboxes();
          this.discountType  = '';
          this.discountValue = 0;
        }),
        catchError(error => {
          this.notificationService.error(error.message || 'Error updating final quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  // ── Email ──────────────────────────────────────────────────────────────────

  private sendQuoteEmail(quote: QuoteDto, pdfBase64: string | null) {
    const toEmail = this.customerEmail;
    if (!toEmail) { this.notificationService.error('Cannot send email: no customer email address found.'); return; }
    const body = this.buildQuoteEmailBody(quote);
    const attachments: EmailAttachmentPayload[] = [];
    if (pdfBase64) {
      attachments.push({
        fileName: `Quote_${quote.quoteNumber.replace(/^(?:DRAFT-|FINAL-)?QUOTE-/i, '')}_${this.customerName.replace(/\s+/g, '_')}.pdf`,
        base64Content: pdfBase64,
        contentType: 'application/pdf'
      });
    }
    const payload: SendDirectEmailPayload = {
      toEmail, toName: this.customerName,
      subject: `Your Quote ${quote.quoteNumber.replace(/^(?:DRAFT-|FINAL-)?QUOTE-/i, '')} from Awnings Ireland`,
      body,
      attachments:    attachments.length > 0 ? attachments : undefined,
      attachBrochure: this.includeBrochure,
      productIds:     this.includeBrochure && this.selectedModelId ? [this.selectedModelId] : undefined
    };
    this.isSendingEmail$.next(true);
    this.emailTaskService.sendDirectEmail(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({
        next: () => this.notificationService.success(`Final Quote ${quote.quoteNumber} emailed to ${toEmail}` + (attachments.length > 0 ? ' with PDF attached' : '')),
        error: () => this.notificationService.error('Quote saved but email could not be sent.')
      });
  }

  private buildQuoteEmailBody(quote: QuoteDto): string {
    const items = quote.quoteItems || [];
    const lines = items.map(i => `  - ${i.description} (Qty: ${i.quantity}) — €${(i.quantity * i.unitPrice).toFixed(2)}`).join('\n');
    const subTotal = this.calcSubTotal(quote);
    const tax      = this.calcTax(quote);
    const total    = this.calcTotal(quote);
    return [
      `Dear ${this.customerName},`,
      '',
      `Please find your final quote reference FINAL-${quote.quoteNumber}.`,
      '',
      'Items:', lines, '',
      `Sub-Total : €${subTotal.toFixed(2)}`,
      `VAT       : €${tax.toFixed(2)}`,
      `Total     : €${total.toFixed(2)}`,
      '', this.terms, '',
      'Kind regards,', 'Awnings Ireland'
    ].join('\n');
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  private async generatePdf(quote: QuoteDto): Promise<string | null> {
    const items = this.quoteItemsSubject$.value;
    const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
    const itemLevelDiscount = items.reduce((sum, i) =>
      sum + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    let quoteLevelDiscount = 0;
    if (this.discountType && this.discountValue > 0) {
      quoteLevelDiscount = this.discountType === 'Percentage'
        ? subtotal * (this.discountValue / 100) : this.discountValue;
    }
    const totalDiscount = itemLevelDiscount + quoteLevelDiscount;
    const totalTax = items.reduce((sum, i) => {
      const sub  = i.quantity * i.unitPrice;
      const disc = sub * ((i.discountPercentage || 0) / 100);
      return sum + ((sub - disc) * ((i.taxRate || 0) / 100));
    }, 0);
    const adjustedTax = quoteLevelDiscount > 0 && (subtotal - itemLevelDiscount) > 0
      ? totalTax * (1 - quoteLevelDiscount / (subtotal - itemLevelDiscount))
      : totalTax;

    const pdfData: QuotePdfData = {
      quoteNumber:        quote.quoteNumber.replace(/^(?:DRAFT-|FINAL-)?QUOTE-/i, ''),
      fileNamePrefix:     'Quote',
      quoteDate:          typeof quote.quoteDate === 'string' ? quote.quoteDate : (quote.quoteDate as Date).toISOString(),
      expiryDate:         this.followUpDate,
      customerName:       this.customerName,
      customerAddress:    this.customerAddress    || '',
      customerCity:       this.customerCity       || '',
      customerPostalCode: this.customerPostalCode || '',
      reference:          this.selectedProductName || 'Final Awning Quote',
      items: items.map(i => ({
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        tax:         i.taxRate || this.vatRate,
        amount:      i.amount
      })),
      subtotal:  subtotal,
      discount:  totalDiscount > 0 ? totalDiscount : undefined,
      totalTax:  adjustedTax,
      taxRate:   this.vatRate,
      total:     subtotal - totalDiscount + adjustedTax,
      terms:     this.terms
    };

    if (typeof this.pdfService.generateQuotePdfAsBase64 === 'function') {
      return await this.pdfService.generateQuotePdfAsBase64(pdfData);
    }
    await this.pdfService.generateQuotePdf(pdfData);
    return null;
  }

  private async downloadQuotePdf(fq: QuoteDto) {
    const items         = fq.quoteItems || [];
    const subtotal      = this.calcSubTotal(fq);
    const itemDiscount  = items.reduce((s, i) =>
      s + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0);
    const quoteDiscount = this.calcQuoteDiscount(fq);
    const totalDiscount = itemDiscount + quoteDiscount;
    const totalTax      = this.calcTax(fq);
    const followUp      = typeof fq.followUpDate === 'string'
      ? fq.followUpDate.split('T')[0]
      : (fq.followUpDate as Date).toISOString().split('T')[0];

    const pdfData: QuotePdfData = {
      quoteNumber:        fq.quoteNumber,
      quoteDate:          typeof fq.quoteDate === 'string' ? fq.quoteDate : (fq.quoteDate as Date).toISOString(),
      expiryDate:         followUp,
      customerName:       this.customerName,
      customerAddress:    this.customerAddress    || '',
      customerCity:       this.customerCity       || '',
      customerPostalCode: this.customerPostalCode || '',
      reference:          this.selectedProductName || 'Final Awning Quote',
      items: items.map(i => ({
        description: i.description,
        quantity:    i.quantity,
        unitPrice:   i.unitPrice,
        tax:         i.taxRate || this.vatRate,
        amount:      i.quantity * i.unitPrice * (1 - (i.discountPercentage || 0) / 100)
      })),
      subtotal:  subtotal,
      discount:  totalDiscount > 0 ? totalDiscount : undefined,
      totalTax:  totalTax,
      taxRate:   this.vatRate,
      total:     this.calcTotal(fq),
      terms:     this.terms
    };

    await this.pdfService.generateQuotePdf(pdfData);
  }

  // ── Addon checkbox reset ───────────────────────────────────────────────────

  private resetAddonCheckboxes() {
    this.selectedBrackets         = [];
    this.selectedMotor            = '';
    this.selectedHeater           = '';
    this.selectedLightingCassette = '';
    this.selectedControl          = '';
    this.includeElectrician         = false;
    this.selectedRalType            = '';
    this.ralCustomCode              = '';
    this.selectedFrameColourId      = null;
    this.includeCorrosionProtection = false;
    this.corrosionProtectionPrice   = 0;
    this.over50Km                   = false;
    this.includeShadeplus           = false;
    this.includeValanceStyle      = false;
    this.selectedValanceType      = 'Straight';
    this.includeWallSealing       = false;
  }
}
