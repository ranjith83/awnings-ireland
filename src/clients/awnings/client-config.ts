import { ClientConfig } from '../client-config.interface';

export const awningsClientConfig: ClientConfig = {
  clientId:     'awnings',
  appName:      'Awnings of Ireland',
  primaryColor: '#5a9fd4',
  routePrefix:  'awnings',
  assets: {
    logoUrl:    'assets/logo.png',
    brandUrl:   'assets/brand.png',
    pdfLogoUrl: 'assets/pdf-logo.png',
    faviconUrl: 'assets/favicon.ico',
  },
  company: {
    name:       'MM Awnings Ltd.',
    tradingAs:  't/a Awnings of Ireland',
    address:    ['Unit 2 Hillview House', '52 Bracken Road', 'Sandyford', 'Dublin 18'],
    email:      'hello@awningsofireland.com',
    website:    'www.awningsofireland.com',
    vat:        '3533984BH',
    regNumber:  '622756',
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
