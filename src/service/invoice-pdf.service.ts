import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface InvoiceItemPdf {
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  discount: number;
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
  customerEmail?: string;
  customerPhone?: string;
  status: string;
  items: InvoiceItemPdf[];
  subtotal: number;
  totalTax: number;
  totalDiscount: number;
  taxRate: number;
  total: number;
  terms?: string;
  notes?: string;
  amountPaid: number;
  amountDue: number;
}

@Injectable({
  providedIn: 'root'
})
export class InvoicePdfService {
  
  constructor() {}

  generateInvoicePdf(data: InvoicePdfData): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Company Header
    doc.setFillColor(41, 128, 185);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('AWNINGS IRELAND', 15, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Unit 5, Business Park', 15, 28);
    doc.text('Dublin, Ireland', 15, 33);
    
    // Invoice Title and Number
    doc.setTextColor(41, 128, 185);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', pageWidth - 15, 20, { align: 'right' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice #: ${data.invoiceNumber}`, pageWidth - 15, 28, { align: 'right' });
    doc.text(`Date: ${data.invoiceDate}`, pageWidth - 15, 34, { align: 'right' });
    
    // Status Badge
    const statusColor = this.getStatusColor(data.status);
    doc.setFillColor(statusColor.r, statusColor.g, statusColor.b);
    doc.roundedRect(pageWidth - 55, 38, 40, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(data.status.toUpperCase(), pageWidth - 35, 43, { align: 'center' });
    
    // Customer Information
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO:', 15, 55);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(data.customerName, 15, 62);
    doc.text(data.customerAddress, 15, 68);
    doc.text(`${data.customerCity} ${data.customerPostalCode}`, 15, 74);
    
    if (data.customerEmail) {
      doc.text(`Email: ${data.customerEmail}`, 15, 80);
    }
    if (data.customerPhone) {
      doc.text(`Phone: ${data.customerPhone}`, 15, 86);
    }
    
    // Invoice Details Box
    const detailsStartY = 55;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(pageWidth - 75, detailsStartY, 60, 30);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Date:', pageWidth - 73, detailsStartY + 7);
    doc.text('Due Date:', pageWidth - 73, detailsStartY + 14);
    doc.text('Amount Due:', pageWidth - 73, detailsStartY + 21);
    
    doc.setFont('helvetica', 'normal');
    doc.text(data.invoiceDate, pageWidth - 17, detailsStartY + 7, { align: 'right' });
    doc.text(data.dueDate, pageWidth - 17, detailsStartY + 14, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 53, 69);
    doc.text(`€${data.amountDue.toFixed(2)}`, pageWidth - 17, detailsStartY + 21, { align: 'right' });
    
    // Items Table
    const tableStartY = 100;
    doc.setTextColor(0, 0, 0);
    
    const tableData = data.items.map(item => [
      item.description,
      item.quantity.toString(),
      `€${item.unitPrice.toFixed(2)}`,
      `${item.tax}%`,
      item.discount > 0 ? `${item.discount}%` : '-',
      `€${item.amount.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: tableStartY,
      head: [['DESCRIPTION', 'QTY', 'UNIT PRICE', 'TAX', 'DISCOUNT', 'AMOUNT']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 70, halign: 'left' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 25, halign: 'center' },
        5: { cellWidth: 30, halign: 'right' }
      },
      styles: {
        fontSize: 9,
        cellPadding: 4
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      }
    });
    
    // Summary Section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const summaryX = pageWidth - 75;
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    
    // Subtotal
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', summaryX, finalY);
    doc.text(`€${data.subtotal.toFixed(2)}`, pageWidth - 15, finalY, { align: 'right' });
    
    // Discount (if any)
    if (data.totalDiscount > 0) {
      doc.text('Discount:', summaryX, finalY + 7);
      doc.setTextColor(220, 53, 69);
      doc.text(`-€${data.totalDiscount.toFixed(2)}`, pageWidth - 15, finalY + 7, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }
    
    // Tax
    const taxY = data.totalDiscount > 0 ? finalY + 14 : finalY + 7;
    doc.text(`Tax (${data.taxRate}%):`, summaryX, taxY);
    doc.text(`€${data.totalTax.toFixed(2)}`, pageWidth - 15, taxY, { align: 'right' });
    
    // Total line
    const totalY = data.totalDiscount > 0 ? finalY + 21 : finalY + 14;
    doc.setLineWidth(1);
    doc.line(summaryX, totalY - 2, pageWidth - 15, totalY - 2);
    
    // Total Amount
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', summaryX, totalY + 5);
    doc.setTextColor(41, 128, 185);
    doc.text(`€${data.total.toFixed(2)}`, pageWidth - 15, totalY + 5, { align: 'right' });
    
    // Amount Paid (if any)
    if (data.amountPaid > 0) {
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Amount Paid:', summaryX, totalY + 12);
      doc.setTextColor(40, 167, 69);
      doc.text(`-€${data.amountPaid.toFixed(2)}`, pageWidth - 15, totalY + 12, { align: 'right' });
      
      // Amount Due
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('Amount Due:', summaryX, totalY + 19);
      doc.setTextColor(220, 53, 69);
      doc.text(`€${data.amountDue.toFixed(2)}`, pageWidth - 15, totalY + 19, { align: 'right' });
    }
    
    // Notes Section
    if (data.notes) {
      const notesY = totalY + (data.amountPaid > 0 ? 30 : 20);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 15, notesY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const notesLines = doc.splitTextToSize(data.notes, pageWidth - 30);
      doc.text(notesLines, 15, notesY + 6);
    }
    
    // Terms and Conditions
    if (data.terms) {
      const termsY = doc.internal.pageSize.getHeight() - 40;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Terms & Conditions:', 15, termsY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const termsLines = doc.splitTextToSize(data.terms, pageWidth - 30);
      doc.text(termsLines, 15, termsY + 5);
    }
    
    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFillColor(41, 128, 185);
    doc.rect(0, footerY, pageWidth, 15, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business!', pageWidth / 2, footerY + 6, { align: 'center' });
    doc.text('For questions, contact: info@awningsireland.ie | +353 1 234 5678', pageWidth / 2, footerY + 10, { align: 'center' });
    
    // Save PDF
    doc.save(`Invoice-${data.invoiceNumber}.pdf`);
  }

  private getStatusColor(status: string): { r: number, g: number, b: number } {
    const statusColors: { [key: string]: { r: number, g: number, b: number } } = {
      'Draft': { r: 108, g: 117, b: 125 },
      'Sent': { r: 0, g: 123, b: 255 },
      'Paid': { r: 40, g: 167, b: 69 },
      'Overdue': { r: 220, g: 53, b: 69 },
      'Cancelled': { r: 108, g: 117, b: 125 },
      'Partially Paid': { r: 255, g: 193, b: 7 }
    };
    
    return statusColors[status] || { r: 108, g: 117, b: 125 };
  }
}