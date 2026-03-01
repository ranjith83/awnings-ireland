import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface QuotePdfData {
  quoteNumber: string;
  quoteDate: string;
  expiryDate: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerPostalCode: string;
  reference: string;
  items: QuotePdfItem[];
  subtotal: number;
  totalTax: number;
  taxRate: number;
  total: number;
  terms: string;
  discount?: number;
}

export interface QuotePdfItem {
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  amount: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerPostalCode: string;
  items: InvoicePdfItem[];
  subtotal: number;
  totalTax: number;
  taxRate: number;
  total: number;
  terms: string;
  notes?: string;
  status: string;
  amountPaid?: number;
  amountDue?: number;
}

export interface InvoicePdfItem {
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  amount: number;
}

@Injectable({
  providedIn: 'root'
})
export class PdfGenerationService {
  private readonly COMPANY_NAME = 'MM Awnings Ltd.';
  private readonly COMPANY_TRADING_AS = 't/a Awnings of Ireland';
  private readonly COMPANY_ADDRESS_LINE1 = 'Unit 2 Hillview House';
  private readonly COMPANY_ADDRESS_LINE2 = '52 Bracken Road';
  private readonly COMPANY_ADDRESS_LINE3 = 'Sandyford';
  private readonly COMPANY_ADDRESS_LINE4 = 'Dublin 18';
  private readonly COMPANY_EMAIL = 'hello@awningsofireland.com';
  private readonly COMPANY_WEBSITE = 'www.awningsofireland.com';
  private readonly COMPANY_VAT = '3533984BH';
  private readonly COMPANY_REG = '622756';
  private readonly LOGO_URL = 'assets/logo.png';
  private readonly ELECTRICIAN_PRICE = 280.00;

  constructor() { }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED LAYOUT BUILDER
  // All quote PDF layout lives here. Both public methods call this, which
  // means the layout is never duplicated and the async logo load is awaited
  // properly before doc.save() / doc.output() is called.
  // ─────────────────────────────────────────────────────────────────────────

  private async buildQuoteDoc(data: QuotePdfData): Promise<jsPDF> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const primaryColor: [number, number, number] = [41, 128, 185];
    const textColor: [number, number, number] = [51, 51, 51];
    const lightGray: [number, number, number] = [245, 245, 245];

    let yPosition = 20;

    // ===== LOGO SECTION =====
    try {
      const logoImg = await this.loadImage(this.LOGO_URL);
      const logoWidth = 60;
      const logoHeight = 15;
      doc.addImage(logoImg, 'PNG', 20, yPosition, logoWidth, logoHeight);
      yPosition += logoHeight + 10;
    } catch (error) {
      console.warn('Logo not loaded, continuing without it', error);
      yPosition = 20;
    }

    // ===== HEADER SECTION =====
    doc.setFontSize(24);
    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.text('QUOTE', 20, yPosition);

    // Company info (right aligned)
    let companyYPos = 20;
    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(this.COMPANY_NAME, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(this.COMPANY_TRADING_AS, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.text(this.COMPANY_ADDRESS_LINE1, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.text(this.COMPANY_ADDRESS_LINE2, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.text(this.COMPANY_ADDRESS_LINE3, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.text(this.COMPANY_ADDRESS_LINE4, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.text(this.COMPANY_EMAIL, pageWidth - 20, companyYPos, { align: 'right' });
    companyYPos += 5;
    doc.text(this.COMPANY_WEBSITE, pageWidth - 20, companyYPos, { align: 'right' });

    // ===== CUSTOMER & QUOTE INFO SECTION =====
    yPosition = 65;

    // Customer address (left side)
    doc.setFont('helvetica', 'bold');
    doc.text(data.customerName, 20, yPosition);
    yPosition += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(data.customerAddress, 20, yPosition);
    yPosition += 5;
    doc.text(data.customerCity, 20, yPosition);
    yPosition += 5;
    doc.text(data.customerPostalCode, 20, yPosition);

    // Quote details (right side)
    yPosition = 65;
    const labelX = pageWidth - 80;
    const valueX = pageWidth - 20;

    doc.setFont('helvetica', 'bold');
    doc.text('Date', labelX, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(this.formatDate(data.quoteDate), valueX, yPosition, { align: 'right' });
    yPosition += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Expiry', labelX, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(this.formatDate(data.expiryDate), valueX, yPosition, { align: 'right' });
    yPosition += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Quote Number', labelX, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(data.quoteNumber, valueX, yPosition, { align: 'right' });
    yPosition += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('Reference', labelX, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(data.reference, valueX, yPosition, { align: 'right' });
    yPosition += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('VAT No:', labelX, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(this.COMPANY_VAT, valueX, yPosition, { align: 'right' });

    // ===== ITEMS TABLE =====
    yPosition += 15;

    const tableData = data.items.map(item => [
      item.description,
      item.quantity.toFixed(2),
      '€' + item.unitPrice.toFixed(2),
      item.tax.toFixed(1) + '%',
      '€' + item.amount.toFixed(2)
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Description', 'Quantity', 'Unit Price', 'Tax', 'Amount EUR']],
      body: tableData,
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 5,
        textColor: textColor,
      },
      headStyles: {
        fillColor: lightGray,
        textColor: textColor,
        fontStyle: 'bold',
        halign: 'left',
      },
      bodyStyles: {
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 35, halign: 'right' },
      },
      margin: { left: 20, right: 20 },
      didDrawCell: (cellData) => {
        if (cellData.section === 'body' && cellData.row.index < tableData.length - 1) {
          const { doc: cellDoc, cell } = cellData;
          cellDoc.setDrawColor(220, 220, 220);
          cellDoc.setLineWidth(0.1);
          cellDoc.line(
            cell.x,
            cell.y + cell.height,
            cell.x + cell.width,
            cell.y + cell.height
          );
        }
      }
    });

    // Get Y position after table
    const finalY = (doc as any).lastAutoTable.finalY || yPosition + 50;

    // ===== TOTALS SECTION =====
    yPosition = finalY + 10;
    const totalsX = pageWidth - 75;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textColor);
    doc.text('Subtotal', totalsX, yPosition);
    doc.text('€' + data.subtotal.toFixed(2), pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 7;

    // Optional discount row
    if (data.discount && data.discount > 0) {
      doc.text('Discount', totalsX, yPosition);
      doc.text('-€' + data.discount.toFixed(2), pageWidth - 20, yPosition, { align: 'right' });
      yPosition += 7;
    }

    doc.text(`TOTAL SALES TAX ${data.taxRate}%`, totalsX, yPosition);
    doc.text('€' + data.totalTax.toFixed(2), pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 7;

    // Total line
    doc.setDrawColor(...textColor);
    doc.setLineWidth(0.5);
    doc.line(totalsX, yPosition - 2, pageWidth - 20, yPosition - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL EUR', totalsX, yPosition + 3);
    doc.text('€' + data.total.toFixed(2), pageWidth - 20, yPosition + 3, { align: 'right' });

    // ===== TERMS SECTION =====
    yPosition += 15;

    if (data.terms) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...textColor);
      doc.text('Terms', 20, yPosition);
      yPosition += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      const termsLines = doc.splitTextToSize(data.terms, pageWidth - 40);
      doc.text(termsLines, 20, yPosition);
      yPosition += (termsLines.length * 5);
    }

    // ===== FOOTER =====
    const footerY = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.setFont('helvetica', 'normal');
    const footerText = `Company Registration No: ${this.COMPANY_REG}. Registered Office: ${this.COMPANY_ADDRESS_LINE1}, ${this.COMPANY_ADDRESS_LINE2}, ${this.COMPANY_ADDRESS_LINE3}, ${this.COMPANY_ADDRESS_LINE4}, D18 R3K2, Ireland.`;
    const footerLines = doc.splitTextToSize(footerText, pageWidth - 40);
    doc.text(footerLines, 20, footerY);

    return doc;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generates the quote PDF and triggers a browser download.
   * FIX: now properly awaits buildQuoteDoc() so doc.save() fires after
   * the async logo load completes — previously the Promise was not awaited
   * in the component, causing a blank page to be saved before any content
   * was drawn.
   */
  async generateQuotePdf(data: QuotePdfData): Promise<void> {
    const doc = await this.buildQuoteDoc(data);
    const fileName = `Quote_${data.quoteNumber}_${data.customerName.replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);
  }

  /**
   * Generates the quote PDF, triggers a browser download, AND returns the
   * raw base64 string for use as an email attachment.
   * FIX: previously this was a stub with no layout code — now delegates to
   * buildQuoteDoc() so it produces a fully populated PDF.
   *
   * @returns base64 string (no data-URI prefix) — pass directly to
   *          EmailAttachmentPayload.base64Content.
   */
  async generateQuotePdfAsBase64(data: QuotePdfData): Promise<string> {
    const doc = await this.buildQuoteDoc(data);
    const fileName = `Quote_${data.quoteNumber}_${data.customerName.replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);

    const dataUri = doc.output('datauristring');
    const b64Index = dataUri.indexOf(',');
    return b64Index !== -1 ? dataUri.slice(b64Index + 1) : dataUri;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INVOICE PDF (unchanged)
  // ─────────────────────────────────────────────────────────────────────────

  generateInvoicePdf(data: InvoicePdfData) {
    const doc = new jsPDF();

    // Company header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('AWNINGS IRELAND', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Unit 5, Bluebell Business Park', 105, 27, { align: 'center' });
    doc.text('Dublin 12, Ireland', 105, 32, { align: 'center' });
    doc.text('Tel: +353 1 234 5678', 105, 37, { align: 'center' });
    doc.text('Email: info@awningsireland.ie', 105, 42, { align: 'center' });

    // Divider line
    doc.setLineWidth(0.5);
    doc.line(20, 48, 190, 48);

    // Invoice title with status
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 20, 58);

    // Status badge
    const statusColors: { [key: string]: number[] } = {
      'Draft': [200, 200, 200],
      'Sent': [52, 152, 219],
      'Paid': [46, 204, 113],
      'Overdue': [231, 76, 60],
      'Cancelled': [149, 165, 166],
      'Partially Paid': [241, 196, 15]
    };

    const statusColor = statusColors[data.status] || [200, 200, 200];
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(150, 53, 35, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(data.status.toUpperCase(), 167.5, 58, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Invoice details (left side)
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Number:', 20, 68);
    doc.setFont('helvetica', 'normal');
    doc.text(data.invoiceNumber, 55, 68);

    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Date:', 20, 74);
    doc.setFont('helvetica', 'normal');
    doc.text(data.invoiceDate, 55, 74);

    doc.setFont('helvetica', 'bold');
    doc.text('Due Date:', 20, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(data.dueDate, 55, 80);

    // Customer details (right side)
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 130, 68);
    doc.setFont('helvetica', 'normal');
    doc.text(data.customerName, 130, 74);
    doc.text(data.customerAddress, 130, 80);
    doc.text(`${data.customerCity} ${data.customerPostalCode}`, 130, 86);

    // Items table
    autoTable(doc, {
      startY: 95,
      head: [['Description', 'Quantity', 'Unit Price', 'Tax %', 'Amount EUR']],
      body: data.items.map(item => [
        item.description,
        item.quantity.toString(),
        `€${item.unitPrice.toFixed(2)}`,
        `${item.tax}%`,
        `€${item.amount.toFixed(2)}`
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 10
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 30 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 35 }
      },
      margin: { left: 10, right: 10 }
    });

    // Totals section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalsX = 130;
    let totalsY = finalY;

    doc.setFont('helvetica', 'normal');
    doc.text('Sub Total:', totalsX, totalsY);
    doc.text(`€${data.subtotal.toFixed(2)}`, 185, totalsY, { align: 'right' });

    totalsY += 6;
    doc.text(`Total Sales TAX ${data.taxRate}%:`, totalsX, totalsY);
    doc.text(`€${data.totalTax.toFixed(2)}`, 185, totalsY, { align: 'right' });

    totalsY += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Total EUR:', totalsX, totalsY);
    doc.text(`€${data.total.toFixed(2)}`, 185, totalsY, { align: 'right' });

    if (data.amountPaid && data.amountPaid > 0) {
      totalsY += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Amount Paid:', totalsX, totalsY);
      doc.text(`€${data.amountPaid.toFixed(2)}`, 185, totalsY, { align: 'right' });

      totalsY += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Amount Due:', totalsX, totalsY);
      doc.text(`€${(data.amountDue || 0).toFixed(2)}`, 185, totalsY, { align: 'right' });
    }

    let currentY = totalsY + 15;
    if (data.notes && data.notes.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Notes:', 20, currentY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const notes = data.notes.split('\n');
      currentY += 6;
      notes.forEach(line => {
        doc.text(line, 20, currentY);
        currentY += 5;
      });
      currentY += 5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Payment Terms:', 20, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const terms = data.terms.split('\n');
    currentY += 6;
    terms.forEach(line => {
      doc.text(line, 20, currentY);
      currentY += 5;
    });

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('Thank you for your business!', 105, 280, { align: 'center' });

    doc.save(`Invoice-${data.invoiceNumber}.pdf`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private loadImage(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Could not get canvas context'));
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // return raw string if unparseable
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }
}