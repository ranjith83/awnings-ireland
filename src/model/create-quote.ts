export interface QuoteItem {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  amount: number;
}

export interface Quote {
  id?: number;
  workflowId: number;
  workflowName: string;
  supplierId?: number;
  modelId?: number;
  widthCm?: number;
  awningType?: string;
  brackets?: string;
  arms?: string;
  motor?: string;
  installationFee: number;
  vatRate: number;
  items: QuoteItem[];
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  emailToCustomer: boolean;
  attachBrochure: boolean;
  createdAt?: Date;
}

export interface Workflow {
  id: number;
  name: string;
  product: string;
}

export interface Supplier {
  id: number;
  name: string;
}

export interface ProductModel {
  id: number;
  name: string;
  supplierId: number;
}
