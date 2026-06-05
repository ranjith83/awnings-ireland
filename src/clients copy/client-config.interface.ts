export interface ClientConfig {
  clientId:     string;
  appName:      string;
  primaryColor: string;
  routePrefix:  string;   // e.g. 'awnings' → /awnings/dashboard
  features: {
    audit:           boolean;
    quickCalculator: boolean;
    followUps:       boolean;
    siteVisit:       boolean;
    userManagement:  boolean;
    configuration:   boolean;
  };
}
