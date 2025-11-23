import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService, RegisterRequest } from '../service/auth.service';
import { Observable, Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, finalize, map, debounceTime } from 'rxjs/operators';

interface User {
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  isActive: boolean;
  dateCreated: Date;
}

interface SearchFilters {
  name: string;
  username: string;
  email: string;
  department: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss'
})
export class UserManagementComponent implements OnInit, OnDestroy {
  private usersSubject = new BehaviorSubject<User[]>([]);
  private searchFiltersSubject = new BehaviorSubject<SearchFilters>({
    name: '',
    username: '',
    email: '',
    department: ''
  });
  
  users$ = this.usersSubject.asObservable();
  filteredUsers$!: Observable<User[]>;
  private destroy$ = new Subject<void>();
  
  registerForm!: FormGroup;
  isLoading$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  showPassword$ = new BehaviorSubject<boolean>(false);
  showConfirmPassword$ = new BehaviorSubject<boolean>(false);
  showModal$ = new BehaviorSubject<boolean>(false);
  isEditMode$ = new BehaviorSubject<boolean>(false);
  selectedUserId: number | null = null;

  searchFilters: SearchFilters = {
    name: '',
    username: '',
    email: '',
    department: ''
  };

  departments = [
    'Sales',
    'Operations',
    'Finance',
    'IT',
    'Management',
    'Customer Service',
    'Other'
  ];

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    // Setup filtered users observable
    this.filteredUsers$ = combineLatest([
      this.users$,
      this.searchFiltersSubject.pipe(debounceTime(300))
    ]).pipe(
      map(([users, filters]) => this.filterUsers(users, filters))
    );
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private filterUsers(users: User[], filters: SearchFilters): User[] {
    return users.filter(user => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const nameMatch = !filters.name || fullName.includes(filters.name.toLowerCase());
      const usernameMatch = !filters.username || user.username.toLowerCase().includes(filters.username.toLowerCase());
      const emailMatch = !filters.email || user.email.toLowerCase().includes(filters.email.toLowerCase());
      const departmentMatch = !filters.department || (user.department && user.department.toLowerCase().includes(filters.department.toLowerCase()));
      
      return nameMatch && usernameMatch && emailMatch && departmentMatch;
    });
  }

  onSearchChange(): void {
    this.searchFiltersSubject.next({ ...this.searchFilters });
  }

  private initializeForm(): void {
    this.registerForm = this.fb.group({
      firstName: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-Z\s'-]+$/)
      ]],
      lastName: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-Z\s'-]+$/)
      ]],
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
      ]],
      username: ['', [
        Validators.required,
        Validators.minLength(4),
        Validators.maxLength(20),
        Validators.pattern(/^[a-zA-Z0-9_]+$/)
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', [Validators.required]],
      department: ['', Validators.required],
      acceptTerms: [false, Validators.requiredTrue]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  loadUsers(): void {
    this.isLoading$.next(true);
    this.authService.getAllUsers().pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading$.next(false))
    ).subscribe({
      next: (users: any) => {
        this.usersSubject.next(users);
      },
      error: (error) => {
        console.error('Error loading users:', error);
        this.errorMessage$.next('Failed to load users');
        setTimeout(() => this.errorMessage$.next(''), 5000);
      }
    });
  }

  openAddModal(): void {
    this.isEditMode$.next(false);
    this.selectedUserId = null;
    this.registerForm.reset();
    this.registerForm.patchValue({ acceptTerms: false });
    this.showModal$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');
  }

  openEditModal(user: User): void {
    this.isEditMode$.next(true);
    this.selectedUserId = user.userId;
    
    // For edit mode, make password optional
    this.registerForm.get('password')?.clearValidators();
    this.registerForm.get('confirmPassword')?.clearValidators();
    this.registerForm.get('acceptTerms')?.clearValidators();
    this.registerForm.get('username')?.clearValidators();
    
    this.registerForm.patchValue({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      department: user.department,
      password: '',
      confirmPassword: '',
      acceptTerms: true
    });

    this.showModal$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');
  }

  closeModal(): void {
    this.showModal$.next(false);
    this.isEditMode$.next(false);
    this.selectedUserId = null;
    this.registerForm.reset();
    this.errorMessage$.next('');
    this.successMessage$.next('');
    
    // Restore validators for add mode
    this.registerForm.get('password')?.setValidators([
      Validators.required,
      Validators.minLength(8),
      this.passwordStrengthValidator
    ]);
    this.registerForm.get('confirmPassword')?.setValidators([Validators.required]);
    this.registerForm.get('acceptTerms')?.setValidators([Validators.requiredTrue]);
    this.registerForm.get('username')?.setValidators([
      Validators.required,
      Validators.minLength(4),
      Validators.maxLength(20),
      Validators.pattern(/^[a-zA-Z0-9_]+$/)
    ]);
  }

  private passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

    const passwordValid = hasUpperCase && hasLowerCase && hasNumeric && hasSpecialChar;

    return !passwordValid ? { passwordStrength: true } : null;
  }

  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;

    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  togglePasswordVisibility(): void {
    this.showPassword$.next(!this.showPassword$.value);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword$.next(!this.showConfirmPassword$.value);
  }

  onSubmit(): void {
    if (this.isEditMode$.value) {
      this.updateUser();
    } else {
      this.addUser();
    }
  }

  addUser(): void {
    if (this.registerForm.valid) {
      this.isLoading$.next(true);
      this.errorMessage$.next('');
      this.successMessage$.next('');

      const registerRequest: RegisterRequest = {
        firstName: this.registerForm.value.firstName.trim(),
        lastName: this.registerForm.value.lastName.trim(),
        email: this.registerForm.value.email.trim().toLowerCase(),
        username: this.registerForm.value.username.trim().toLowerCase(),
        password: this.registerForm.value.password,
        confirmPassword: this.registerForm.value.confirmPassword,
        department: this.registerForm.value.department
      };

      this.authService.register(registerRequest).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading$.next(false))
      ).subscribe({
        next: (response) => {
          this.successMessage$.next('User registered successfully!');
          
          setTimeout(() => {
            this.closeModal();
            this.loadUsers();
          }, 1500);
        },
        error: (error) => {
          console.error('Registration error:', error);
          this.errorMessage$.next(error.message || 'Registration failed. Please try again.');
        }
      });
    } else {
      this.markFormGroupTouched(this.registerForm);
      this.errorMessage$.next('Please fill in all required fields correctly.');
    }
  }

  updateUser(): void {
    if (this.selectedUserId === null) return;

    this.isLoading$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    const updateData: any = {
      firstName: this.registerForm.value.firstName.trim(),
      lastName: this.registerForm.value.lastName.trim(),
      email: this.registerForm.value.email.trim().toLowerCase(),
      department: this.registerForm.value.department
    };

    this.authService.updateUser(this.selectedUserId, updateData).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading$.next(false))
    ).subscribe({
      next: (response) => {
        this.successMessage$.next('User updated successfully!');
        
        setTimeout(() => {
          this.closeModal();
          this.loadUsers();
        }, 1500);
      },
      error: (error) => {
        console.error('Update error:', error);
        this.errorMessage$.next(error.message || 'Update failed. Please try again.');
      }
    });
  }

  deleteUser(userId: number, username: string): void {
    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      this.authService.deleteUser(userId).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          this.successMessage$.next('User deleted successfully!');
          this.loadUsers();
          
          setTimeout(() => {
            this.successMessage$.next('');
          }, 3000);
        },
        error: (error) => {
          console.error('Delete error:', error);
          this.errorMessage$.next(error.message || 'Failed to delete user.');
          setTimeout(() => this.errorMessage$.next(''), 5000);
        }
      });
    }
  }

  toggleUserStatus(user: User): void {
    const action = user.isActive ? 'deactivate' : 'activate';
    const actionMethod = user.isActive 
      ? this.authService.deactivateUser(user.userId)
      : this.authService.activateUser(user.userId);

    actionMethod.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.successMessage$.next(`User ${action}d successfully!`);
        this.loadUsers();
        
        setTimeout(() => {
          this.successMessage$.next('');
        }, 3000);
      },
      error: (error) => {
        console.error(`${action} error:`, error);
        this.errorMessage$.next(error.message || `Failed to ${action} user.`);
        setTimeout(() => this.errorMessage$.next(''), 5000);
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  get firstName() { return this.registerForm.get('firstName'); }
  get lastName() { return this.registerForm.get('lastName'); }
  get email() { return this.registerForm.get('email'); }
  get username() { return this.registerForm.get('username'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
  get department() { return this.registerForm.get('department'); }
  get acceptTerms() { return this.registerForm.get('acceptTerms'); }

  get hasPasswordMismatch(): boolean {
    return this.registerForm.hasError('passwordMismatch') && 
           this.confirmPassword?.touched || false;
  }
}