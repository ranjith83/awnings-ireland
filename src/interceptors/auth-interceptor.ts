import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Get token from localStorage
  const token = localStorage.getItem('token');
  
  // Log for debugging (remove in production)
  console.log('🔐 Auth Interceptor triggered:', {
    url: req.url,
    method: req.method,
    hasToken: !!token
  });
  
  // If token exists, clone the request and add Authorization header
  if (token) {
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log('✅ Authorization header added:', 
      clonedRequest.headers.get('Authorization')?.substring(0, 30) + '...');
    
    return next(clonedRequest);
  }
  
  // If no token, send original request
  console.log('⚠️ No token found - sending request without Authorization header');
  return next(req);
};