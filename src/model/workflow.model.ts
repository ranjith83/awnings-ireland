
export interface Workflow {
  id?: number;
  product: string;
  description: string;
  initialEnquiry: boolean;
  createQuote: boolean;
  inviteShowroom: boolean;
  setupSiteVisit: boolean;
  invoice: boolean;
  dateAdded: Date;
  addedBy: string;
  supplierId?: number;
  modelId?: number;
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

export enum WorkflowStage {
  WORKFLOW = 'Workflow',
  INITIAL_ENQUIRY = 'Intial Enquiry',
  CREATE_QUOTE = 'Create Quote',
  INVITE_SHOWROOM = 'Invite showroom',
  SETUP_SITE_VISIT = 'Setup site visit',
  INVOICE = 'Invoice'
}
