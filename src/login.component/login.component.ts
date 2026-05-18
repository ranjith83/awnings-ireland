// login.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../service/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  sessionExpiredMessage = '';
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/']);
    }

    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['sessionExpired'] === 'true') {
        this.sessionExpiredMessage = 'Your session has expired. Please sign in again.';
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get username() {
    return this.loginForm.get('username');
  }

  get password() {
    return this.loginForm.get('password');
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.controls[key].markAsTouched();
      });
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.sessionExpiredMessage = '';  // Clear expiry banner on new attempt

    const credentials = {
      username: this.loginForm.value.username,
      password: this.loginForm.value.password,
      rememberMe: this.loginForm.value.rememberMe
    };

    this.authService.login(credentials).subscribe({
      next: (response) => {
        console.log('Login successful', response);
        this.isLoading = false;
        this.cdr.markForCheck();
        this.router.navigate(['/']);
      },
      error: (error) => {
        console.error('Login error', error);
        this.errorMessage = error.message || 'Invalid username or password';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  getErrorMessage(controlName: string): string {
    const control = this.loginForm.get(controlName);
    if (control?.touched && control?.errors) {
      if (control.errors['required']) {
        return `${this.getFieldLabel(controlName)} is required`;
      }
      if (control.errors['minlength']) {
        return `${this.getFieldLabel(controlName)} must be at least ${control.errors['minlength'].requiredLength} characters`;
      }
    }
    return '';
  }

  getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      username: 'Username',
      password: 'Password'
    };
    return labels[fieldName] || fieldName;
  }
}