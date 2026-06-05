import { ClientConfig } from '../client-config.interface';

export const awningsClientConfig: ClientConfig = {
  clientId:     'awnings',
  appName:      'Awnings of Ireland',
  primaryColor: '#5a9fd4',
  routePrefix:  'awnings',
  features: {
    audit:           true,
    quickCalculator: true,
    followUps:       true,
    siteVisit:       true,
    userManagement:  true,
    configuration:   true,
  },
};
