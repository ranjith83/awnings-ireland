import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../service/auth.service';
import { environment } from '../app/environments/environment';

export const AuthGuard = () => {
  const authService = inject(AuthService);
  const router      = inject(Router);

  if (authService.isAuthenticated) return true;

  router.navigate([`/${environment.client.routePrefix}/login`]);
  return false;
};
