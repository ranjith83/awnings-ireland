import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface QuotePdfData {
  quoteNumber: string;
  quoteDate: string;
  expiryDate: string | Date;
  customerName: string;
  customerAddress: string;
  customerCity: string;
  customerPostalCode: string;
  reference: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    tax: number;
    amount: number;
  }>;
  subtotal: number;
  totalTax: number;
  taxRate: number;
  total: number;
  terms?: string;
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
  
  constructor() {}

  generateQuotePdf(data: QuotePdfData): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Set colors
    const primaryColor: [number, number, number] = [41, 128, 185];
    const textColor: [number, number, number] = [51, 51, 51];
    const lightGray: [number, number, number] = [245, 245, 245];
    
    let yPosition = 20;

    // ===== HEADER SECTION =====
    // QUOTE title
    doc.setFontSize(24);
    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.text('QUOTE', 20, yPosition);
    
    // Company info (right aligned)
    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    doc.setFont('helvetica', 'bold');
    doc.text(this.COMPANY_NAME, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(this.COMPANY_TRADING_AS, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.text(this.COMPANY_ADDRESS_LINE1, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.text(this.COMPANY_ADDRESS_LINE2, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.text(this.COMPANY_ADDRESS_LINE3, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.text(this.COMPANY_ADDRESS_LINE4, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.text(this.COMPANY_EMAIL, pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 5;
    doc.text(this.COMPANY_WEBSITE, pageWidth - 20, yPosition, { align: 'right' });
    
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
    let expiryDate = (data.expiryDate instanceof Date) ? data.expiryDate.toISOString()
                    : data.expiryDate
    doc.text(this.formatDate(expiryDate), valueX, yPosition, { align: 'right' });
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
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 35, halign: 'right' },
      },
      margin: { left: 20, right: 20 },
    });
    
    // Get Y position after table
    const finalY = (doc as any).lastAutoTable.finalY || yPosition + 50;
    
    // ===== TOTALS SECTION =====
    yPosition = finalY + 10;
    const totalsX = pageWidth - 75;
    
    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal', totalsX, yPosition);
    doc.text('€' + data.subtotal.toFixed(2), pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 7;
    
    // Tax
    doc.text(`TOTAL SALES TAX ${data.taxRate}%`, totalsX, yPosition);
    doc.text('€' + data.totalTax.toFixed(2), pageWidth - 20, yPosition, { align: 'right' });
    yPosition += 7;
    
    // Total line
    doc.setLineWidth(0.5);
    doc.line(totalsX, yPosition - 2, pageWidth - 20, yPosition - 2);
    
    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL EUR', totalsX, yPosition + 3);
    doc.text('€' + data.total.toFixed(2), pageWidth - 20, yPosition + 3, { align: 'right' });
    
    // ===== TERMS SECTION =====
    yPosition += 15;
    
    if (data.terms) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
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
    
    // Save PDF
    const fileName = `Quote_${data.quoteNumber}_${data.customerName.replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);
  }
  
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }
}