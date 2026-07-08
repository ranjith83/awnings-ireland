import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth.service';
import { environment } from '../app/environments/environment';

export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin) return true;

  router.navigate([`/${environment.client.routePrefix}/dashboard`]);
  return false;
};
