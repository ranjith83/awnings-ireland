import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

interface Workflow {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
}


@Component({
  selector: 'app-setup-site-visit.component',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './setup-site-visit.component.html',
  styleUrl: './setup-site-visit.component.scss'
})
export class SetupSiteVisitComponent {

 siteVisitForm: FormGroup;
  activeTab: string = 'select-product';
  
  workflows: Workflow[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' },
    { id: '3', name: 'Markilux 3300' }
  ];

  supplierTypes: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  models: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  awnings: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  wallTypes: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  wallFinishes: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  bracketTypes: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  operations: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  operationSides: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  fabrics: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  ralOptions: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  electricians: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  sealingProfiles: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  standoffBrackets: ProductOption[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' }
  ];

  constructor(private fb: FormBuilder) {
    this.siteVisitForm = this.fb.group({
      workflow: ['', Validators.required],
      supplierType: [''],
      model: [''],
      width: [''],
      awnings: [''],
      heightAwnings: [''],
      wallType: [''],
      externalThickness: [''],
      wallFinish: [''],
      bracketType: [''],
      operation: [''],
      operationSide: [''],
      fabric: [''],
      ral: [''],
      valanceShape: [''],
      electrician: [''],
      wallSealingProfile: [''],
      standoffBrackets: [''],
      corrosionProduction: [false],
      valance: [false]
    });
  }

  ngOnInit(): void {
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  onSubmit(): void {
    if (this.siteVisitForm.valid) {
      console.log('Form submitted:', this.siteVisitForm.value);
      // Implement your submit logic here
    } else {
      this.markFormGroupTouched(this.siteVisitForm);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}
