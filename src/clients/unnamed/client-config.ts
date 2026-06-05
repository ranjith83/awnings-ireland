import { ClientConfig } from '../client-config.interface';

export const unnamedClientConfig: ClientConfig = {
  clientId:     'unnamed',
  appName:      'My App',
  primaryColor: '#6d28d9',
  routePrefix:  'unnamed',
  assets: {
    logoUrl:    'assets/favicon.ico',
    brandUrl:   'assets/favicon.ico',
    pdfLogoUrl: 'assets/favicon.ico',
    faviconUrl: 'assets/favicon.ico',
  },
  company: {
    name:      'My Company Ltd.',
    address:   ['Address Line 1', 'Address Line 2', 'City'],
    email:     'hello@mycompany.com',
    website:   'www.mycompany.com',
    vat:       '',
    regNumber: '',
  },
  features: {
    audit:           true,
    quickCalculator: true,
    followUps:       true,
    siteVisit:       true,
    userManagement:  true,
    configuration:   true,
  },
};
