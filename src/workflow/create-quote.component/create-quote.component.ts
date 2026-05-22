import { Component, HostListener, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntil, tap, catchError, of, finalize } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import {
  CreateQuoteService,
  CreateQuoteDto,
  QuoteDto,
  UpdateQuoteDto,
  UpdateQuoteItemDto,
} from '../../service/create-quote.service';
import { WorkflowService } from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
import { PdfGenerationService, QuotePdfData } from '../../service/pdf-generation.service';
import { EmailTaskService, SendDirectEmailPayload, EmailAttachmentPayload } from '../../service/email-task.service';
import { NotificationService } from '../../service/notification.service';
import { QuoteFormBase, QuoteItemDisplay } from '../quote-form-base';
import { OptionLookupDto } from '../../service/option-lookup.service';

@Component({
  selector: 'app-create-quote.component',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-quote.component.html',
  styleUrl: './create-quote.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateQuoteComponent extends QuoteFormBase implements OnInit {

  editingQuote: QuoteDto | null = null;
  pageSize = 10;

  // Re-declared so the Angular Language Service resolves them from the template.
  override windSensorOptions: OptionLookupDto[] = [];
  override selectedWindSensor = '';

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
    if (!target.closest('.custom-dropdown'))      this.bracketDropdownOpen = false;
    if (!target.closest('.frame-colour-dropdown')) this.frameColourDropdownOpen = false;
  }

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

        if (!this.customerId) {
          this.notificationService.error('No customer selected. Please select a customer first.');
          return;
        }

        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        this.customerId   = selectedWorkflow?.customerId   || this.customerId;
        this.customerName = selectedWorkflow?.customerName || this.customerName;
        const workflowId  = selectedWorkflow?.id           || paramWorkflowId || 0;

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

  // ── Abstract method implementations ────────────────────────────────────────

  protected loadExistingQuotes(workflowId: number) {
    this.isLoadingQuotes$.next(true);
    this.createQuoteService.getQuotesByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(quotes => {
          this.draftQuotesSubject$.next(quotes.filter(q => !q.draftQuoteId));
          this.finalQuotesSubject$.next(quotes.filter(q =>  !!q.draftQuoteId));
          this.cdr.markForCheck();
        }),
        catchError(() => { this.notificationService.error('Failed to load quotes'); return of([]); }),
        finalize(() => { this.isLoadingQuotes$.next(false); this.cdr.markForCheck(); })
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
    this.includeElectrician            = false;
    this.selectedRalType               = '';
    this.ralCustomCode                 = '';
    this.selectedFrameColourId         = null;
    this.includeCorrosionProtection    = false;
    this.corrosionProtectionPrice      = 0;
    this.over50Km                      = false;
    this.includeShadeplus              = false;
    this.shadePlusAllRows = [];
    this.shadePlusOptions = [];
    this.shadePlusHasMultiple = false;
    this.selectedShadePlusId = null;
    this.selectedShadePlusDescription = '';
    this.includeValanceStyle = false;
    this.selectedValanceType = '';
    this.includeWallSealing = false;
    this.extrasDescription = '';
    this.extrasPrice = 0;
    this.fabricCode = '';
    this.selectedWindSensor = '';
    this.enteredWidthCm = null;
    this.selectedWidthCm = null;
    this.selectedAwning = null;
    const first = this.quoteItemsSubject$.value.find(i => i.description.includes('wide x'));
    this.quoteItemsSubject$.next(first ? [first] : []);
    this.notificationService.success('');
  }

  // ── Existing quotes grid ────────────────────────────────────────────────────

  hasFinalQuote(draft: QuoteDto): boolean {
    return !!draft.isFinal;
  }

  editQuote(quote: QuoteDto) {
    this.editingQuote = quote;
    this.populateFormFromQuote(quote);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  cancelEdit() {
    this.editingQuote = null;
    this.resetFormPartial();
  }

  deleteQuote(quote: QuoteDto) {
    this.createQuoteService.deleteQuote(quote.quoteId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(() => {
        this.draftQuotesSubject$.next(
          this.draftQuotesSubject$.value.filter(q => q.quoteId !== quote.quoteId)
        );
        if (this.editingQuote?.quoteId === quote.quoteId) {
          this.editingQuote = null;
          this.resetFormPartial();
        }
        this.notificationService.success(`Quote ${quote.quoteNumber} deleted.`);
        this.workflowStateService.notifyWorkflowChanged();
      });
  }

  private populateFormFromQuote(quote: QuoteDto) {
    const parseDate = (d: string | Date): string =>
      typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
    this.quoteDate         = parseDate(quote.quoteDate);
    this.followUpDate      = parseDate(quote.followUpDate);
    this.discountType      = quote.discountType  || '';
    this.discountValue     = quote.discountValue || 0;
    this.selectedWindSensor = quote.windSensorOption || '';
    this.fabricCode         = quote.fabricCode        || '';

    this.quoteItemsSubject$.next((quote.quoteItems || []).map(qi => ({
      productItemId:      qi.productItemId,
      description:        qi.description,
      quantity:           qi.quantity,
      unitPrice:          qi.unitPrice,
      taxRate:            qi.taxRate,
      discountPercentage: qi.discountPercentage,
      amount:             this.calculateAmount(qi.quantity, qi.unitPrice, qi.taxRate, qi.discountPercentage)
    } as QuoteItemDisplay)));
    this.onDiscountChange();
  }

  // ── Generate / Update quote ─────────────────────────────────────────────────

  generateQuote() {
    const items = this.quoteItemsSubject$.value;
    if (!this.workflowId || !this.customerId || items.length === 0) {
      this.notificationService.error('Please fill in all required fields and ensure at least one quote item exists');
      return;
    }
    if (this.editingQuote) this.updateDraftQuote(items);
    else                   this.createDraftQuote(items);
  }

  private createDraftQuote(items: QuoteItemDisplay[]) {
    const createDto: CreateQuoteDto = {
      workflowId:        this.workflowId!,
      customerId:        this.customerId!,
      quoteDate:         this.quoteDate,
      followUpDate:      this.followUpDate,
      notes:             this.notes,
      terms:             this.terms,
      discountType:      this.discountType  || undefined,
      discountValue:     this.discountValue || undefined,
      windSensorOption:  this.selectedWindSensor || undefined,
      fabricCode:        this.fabricCode         || undefined,
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

    this.createQuoteService.createQuote(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (createdQuote) => {
          this.draftQuotesSubject$.next([...this.draftQuotesSubject$.value, createdQuote]);
          this.notificationService.success(`Draft Quote ${createdQuote.quoteNumber} created successfully!`);
          this.workflowStateService.notifyStepCompleted('create-quote');
          const pdfBase64 = await this.generatePdf(createdQuote);
          if (this.emailToCustomer) this.sendQuoteEmail(createdQuote, pdfBase64);
          setTimeout(() => this.resetFormPartial(), 2000);
        }),
        catchError(error => {
          this.notificationService.error(error.message || 'Error generating quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  private updateDraftQuote(items: QuoteItemDisplay[]) {
    const q = this.editingQuote!;
    const updateDto: UpdateQuoteDto = {
      quoteDate:        this.quoteDate,
      followUpDate:     this.followUpDate,
      notes:            this.notes,
      terms:            this.terms,
      discountType:     this.discountType  || undefined,
      discountValue:    this.discountValue || undefined,
      windSensorOption: this.selectedWindSensor || undefined,
      fabricCode:       this.fabricCode         || undefined,
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

    this.createQuoteService.updateQuote(q.quoteId, updateDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(async (updatedQuote) => {
          this.draftQuotesSubject$.next(
            this.draftQuotesSubject$.value.map(dq => dq.quoteId === updatedQuote.quoteId ? updatedQuote : dq)
          );
          this.editingQuote = null;
          this.notificationService.success(`Quote ${updatedQuote.quoteNumber} updated successfully!`);
          const pdfBase64 = await this.generatePdf(updatedQuote);
          if (this.emailToCustomer) this.sendQuoteEmail(updatedQuote, pdfBase64);
          setTimeout(() => this.resetFormPartial(), 2000);
        }),
        catchError(error => {
          this.notificationService.error(error.message || 'Error updating quote. Please try again.');
          return of(null);
        }),
        finalize(() => this.isLoading$.next(false))
      ).subscribe();
  }

  private async sendQuoteEmail(quote: QuoteDto, pdfBase64: string | null) {
    const toEmail = this.customerEmail;
    if (!toEmail) {
      this.notificationService.error('Cannot send email: no customer email address found.');
      return;
    }

    const body = this.buildQuoteEmailBody(quote);
    const attachments: EmailAttachmentPayload[] = [];
    if (pdfBase64) {
      attachments.push({
        fileName:      `DraftQuote_${quote.quoteNumber.replace(/^(?:DRAFT-|FINAL-)?QUOTE-/i, '')}_${this.customerName.replace(/\s+/g, '_')}.pdf`,
        base64Content: pdfBase64,
        contentType:   'application/pdf'
      });
    }

    const payload: SendDirectEmailPayload = {
      toEmail,
      toName:         this.customerName,
      subject:        `Your Draft Quote ${quote.quoteNumber.replace(/^(?:DRAFT-|FINAL-)?QUOTE-/i, '')} from Awnings Ireland`,
      body,
      attachments:    attachments.length > 0 ? attachments : undefined,
      attachBrochure: this.includeBrochure,
      productIds:     this.includeBrochure && this.selectedModelId ? [this.selectedModelId] : undefined
    };

    this.isSendingEmail$.next(true);
    this.emailTaskService.sendDirectEmail(payload)
      .pipe(takeUntil(this.destroy$), finalize(() => this.isSendingEmail$.next(false)))
      .subscribe({
        next: () => this.notificationService.success(
          `Draft Quote DRAFT-${quote.quoteNumber} emailed to ${toEmail}` +
          (attachments.length > 0 ? ' with PDF attached' : '')
        ),
        error: () => this.notificationService.error('Quote saved but email could not be sent.')
      });
  }

  private buildQuoteEmailBody(quote: QuoteDto): string {
    const items = this.quoteItemsSubject$.value;
    const lines = items.map(i =>
      `  - ${i.description} (Qty: ${i.quantity}) — €${(i.quantity * i.unitPrice).toFixed(2)}`
    ).join('\n');

    return [
      `Dear ${this.customerName},`,
      '',
      `Please find below your draft quote reference DRAFT-${quote.quoteNumber}.`,
      '',
      'Items:',
      lines,
      '',
      `Sub-Total : €${quote.subTotal?.toFixed(2)    ?? '0.00'}`,
      `VAT       : €${quote.taxAmount?.toFixed(2)   ?? '0.00'}`,
      `Total     : €${quote.totalAmount?.toFixed(2) ?? '0.00'}`,
      '',
      this.terms,
      '',
      'Kind regards,',
      'Awnings Ireland'
    ].join('\n');
  }

  // ── PDF ─────────────────────────────────────────────────────────────────────

  private async generatePdf(quote: QuoteDto): Promise<string | null> {
    const items = this.quoteItemsSubject$.value;
    const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
    const itemLevelDiscount = items.reduce(
      (sum, i) => sum + (i.quantity * i.unitPrice * ((i.discountPercentage || 0) / 100)), 0
    );

    let quoteLevelDiscount = 0;
    if (this.discountType && this.discountValue > 0) {
      quoteLevelDiscount = this.discountType === 'Percentage'
        ? subtotal * (this.discountValue / 100)
        : this.discountValue;
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
      fileNamePrefix:     'DraftQuote',
      quoteDate:          typeof quote.quoteDate === 'string'
                            ? quote.quoteDate
                            : (quote.quoteDate as Date).toISOString(),
      expiryDate:         this.followUpDate,
      customerName:       this.customerName,
      customerAddress:    this.customerAddress    || '',
      customerCity:       this.customerCity       || '',
      customerPostalCode: this.customerPostalCode || '',
      reference:          this.selectedProductName || 'Awning Quote',
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
}
