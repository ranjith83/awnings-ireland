export interface ClientConfig {
  clientId:     string;
  appName:      string;
  primaryColor: string;
  routePrefix:  string;
  assets: {
    logoUrl:     string;   // sidebar / header logo
    brandUrl:    string;   // register / login page logo
    pdfLogoUrl:  string;   // PDF generation logo
    faviconUrl:  string;
  };
  company: {
    name:        string;
    tradingAs?:  string;
    address:     string[];
    email:       string;
    website:     string;
    vat:         string;
    regNumber:   string;
  };
  features: {
    audit:           boolean;
    quickCalculator: boolean;
    followUps:       boolean;
    siteVisit:       boolean;
    userManagement:  boolean;
    configuration:   boolean;
  };
}
