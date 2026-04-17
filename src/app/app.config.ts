import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, provideHttpClient, withFetch, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { LoadingInterceptor } from './interceptors/loading-interceptor';
import { authInterceptor } from '../interceptors/auth-interceptor';
import { AuthInterceptor } from './interceptors/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),   // only once
 
    // Single provideHttpClient — withInterceptorsFromDi() enables class-based interceptors
    // withFetch() uses the Fetch API instead of XHR (required for SSR / hydration)
    provideHttpClient(
      withInterceptorsFromDi(),
      withFetch()
    ),
 
    // Class-based interceptors — order matters: AuthInterceptor runs first
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoadingInterceptor,
      multi: true
    }
  ]
};
