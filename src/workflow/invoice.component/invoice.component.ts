import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';

interface Workflow {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  amount: number;
}

@Component({
  selector: 'app-invoice.component',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './invoice.component.html',
  styleUrl: './invoice.component.scss'
})

export class InvoiceComponent implements OnInit {
  invoiceForm: FormGroup;
  
  workflows: Workflow[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' },
    { id: '3', name: 'Markilux 3300' }
  ];

  supplierTypes: ProductOption[] = [
    { id: '1', name: 'Select' },
    { id: '2', name: 'Supplier A' },
    { id: '3', name: 'Supplier B' }
  ];

  models: ProductOption[] = [
    { id: '1', name: 'Select' },
    { id: '2', name: 'Model A' },
    { id: '3', name: 'Model B' }
  ];

  awnings: ProductOption[] = [
    { id: '1', name: 'Select' },
    { id: '2', name: 'Awning Type A' },
    { id: '3', name: 'Awning Type B' }
  ];

  widths: ProductOption[] = [
    { id: '1', name: 'Select' },
    { id: '2', name: '100 cm' },
    { id: '3', name: '200 cm' }
  ];

  brackets: ProductOption[] = [
    { id: '1', name: 'Select' },
    { id: '2', name: 'Standard Bracket' },
    { id: '3', name: 'Heavy Duty Bracket' }
  ];

  motors: ProductOption[] = [
    { id: '1', name: 'Select' },
    { id: '2', name: 'Motor A' },
    { id: '3', name: 'Motor B' }
  ];

  invoiceItems: InvoiceItem[] = [
    { description: '1 LED up RGB', quantity: 1, unitPrice: 23.34, tax: 13.5, amount: 100 },
    { description: '3 Loggica Sliding Panels', quantity: 1, unitPrice: 23.34, tax: 13.5, amount: 100 },
    { description: '4.5mm × 3.2m 2 Intermediate Parts', quantity: 1, unitPrice: 23.34, tax: 13.5, amount: 100 },
    { description: 'Heating Beam', quantity: 1, unitPrice: 23.34, tax: 13.5, amount: 100 },
    { description: 'LED Lineo in Blades " 3', quantity: 1, unitPrice: 23.34, tax: 13.5, amount: 100 },
    { description: 'Somfy Radio Controller Motor', quantity: 1, unitPrice: 23.34, tax: 13.5, amount: 100 }
  ];

  vatRate: number = 13.5;

  constructor(private fb: FormBuilder) {
    this.invoiceForm = this.fb.group({
      workflow: ['Markilux 990', Validators.required],
      supplierType: [''],
      model: [''],
      awning: [''],
      width: [''],
      brackets: [''],
      motor: [''],
      fee: [''],
      emailInvoice: [false]
    });
  }

  ngOnInit(): void {
  }

  getSubTotal(): number {
    return this.invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  }

  getTotalTax(): number {
    const subTotal = this.getSubTotal();
    return Number((subTotal * (this.vatRate / 100)).toFixed(2));
  }

  getTotalAmount(): number {
    return this.getSubTotal() + this.getTotalTax();
  }

  onClose(): void {
    this.invoiceForm.reset();
  }

  onGenerateQuote(): void {
    if (this.invoiceForm.valid) {
      const invoiceData = {
        ...this.invoiceForm.value,
        items: this.invoiceItems,
        subTotal: this.getSubTotal(),
        tax: this.getTotalTax(),
        total: this.getTotalAmount()
      };
      console.log('Generate Quote:', invoiceData);
      // Implement your generate quote logic here
    }
  }
}
