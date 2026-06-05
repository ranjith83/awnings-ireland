import { ClientConfig } from '../client-config.interface';

export const unnamedClientConfig: ClientConfig = {
  clientId:     'unnamed',
  appName:      'My App',
  primaryColor: '#6d28d9',
  routePrefix:  'unnamed',
  features: {
    audit:           true,
    quickCalculator: true,
    followUps:       true,
    siteVisit:       true,
    userManagement:  true,
    configuration:   true,
  },
};
