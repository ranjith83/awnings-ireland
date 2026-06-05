import { Injectable } from '@angular/core';
import { environment } from '../app/environments/environment';
import { ClientConfig } from '../clients/client-config.interface';

@Injectable({ providedIn: 'root' })
export class ClientConfigService {
  readonly config: ClientConfig = environment.client;

  get appName():      string  { return this.config.appName; }
  get primaryColor(): string  { return this.config.primaryColor; }
  get clientId():     string  { return this.config.clientId; }
  get routePrefix():  string  { return this.config.routePrefix; }
  get assets()                { return this.config.assets; }

  hasFeature(feature: keyof ClientConfig['features']): boolean {
    return this.config.features[feature];
  }
}
