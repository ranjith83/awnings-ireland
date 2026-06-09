import { Injectable } from '@angular/core';
import { NavigationExtras, Router } from '@angular/router';
import { ClientConfigService } from './client-config.service';

@Injectable({ providedIn: 'root' })
export class NavService {
  constructor(
    private router: Router,
    private clientConfig: ClientConfigService
  ) {}

  /** Navigate with automatic client-prefix prepended to absolute paths. */
  go(commands: any[], extras?: NavigationExtras): Promise<boolean> {
    return this.router.navigate(this._prefix(commands), extras);
  }

  private _prefix(commands: any[]): any[] {
    if (!commands.length) return commands;
    const first = String(commands[0]);
    const base  = `/${this.clientConfig.routePrefix}`;
    if (first === '/') return [`${base}/dashboard`];
    if (!first.startsWith('/') || first.startsWith(base)) return commands;
    return [`${base}${first}`, ...commands.slice(1)];
  }
}
