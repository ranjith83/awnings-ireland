import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

interface Workflow {
  id: string;
  name: string;
}

interface ProductModel {
  id: string;
  name: string;
  key: string;
}

interface FieldConfig {
  name: string;
  label: string;
  type: 'dropdown' | 'text' | 'checkbox';
  values?: string[];
  visibleFor: string[]; // Product model keys where this field is visible
}

@Component({
  selector: 'app-setup-site-visit.component',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './setup-site-visit.component.html',
  styleUrl: './setup-site-visit.component.scss'
})
export class SetupSiteVisitComponent {

  siteVisitForm: FormGroup;
  activeTab: string = 'product-model';
  selectedProductModel: string = '';
  showFullTabs: boolean = false;
  
  workflows: Workflow[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' },
    { id: '3', name: 'Markilux 3300' }
  ];

  productModels: ProductModel[] = [
    { id: '1', name: 'Awning', key: 'awning' },
    { id: '2', name: 'Roof System', key: 'roofSystem' },
    { id: '3', name: 'Blind', key: 'blind' },
    { id: '4', name: 'Parasol', key: 'parasol' },
    { id: '5', name: 'Glass Screen', key: 'glassScreen' },
    { id: '6', name: 'Fabric wind breaker', key: 'fabricWindBreaker' },
    { id: '7', name: 'Polycarbonate Roof', key: 'polycarbonateRoof' },
    { id: '8', name: 'Pergola', key: 'pergola' },
    { id: '9', name: 'Other', key: 'other' }
  ];

  // Product Model Section Fields (renamed from Product Details)
  productModelFields: FieldConfig[] = [
    {
      name: 'siteLayout',
      label: 'Site Survey layout',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'structure',
      label: 'Structure',
      type: 'dropdown',
      values: ['Free Standing', 'Mounted to Building'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'passageHeight',
      label: 'Passage Height (m)',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'width',
      label: 'Width (m)',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'projection',
      label: 'Projection (m)',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol', 'glassScreen']
    },
    {
      name: 'heightAvailable',
      label: 'Height Available',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'wallType',
      label: 'Wall Type',
      type: 'dropdown',
      values: ['Red Brick', 'Block', 'External Insulation'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'externalInsulation',
      label: 'External Insulation',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'wallFinish',
      label: 'Wall Finish',
      type: 'dropdown',
      values: ['Rendered', 'Smooth', 'Pebbledash'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'wallThickness',
      label: 'Wall Thickness',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'specialBrackets',
      label: 'Special Brackets',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'sideInfills',
      label: 'Side Infills',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'flashingRequired',
      label: 'Flashing Required',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'flashingDimensions',
      label: 'Flashing Dimensions',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'standOfBrackets',
      label: 'Stand of Brackets',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'standOfBracketDimension',
      label: 'Stand of Bracket Dimension',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'electrician',
      label: 'Electrician',
      type: 'dropdown',
      values: ['Ours', 'Own'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'electricalConnection',
      label: 'Electrical Connection',
      type: 'dropdown',
      values: ['Plug in', 'Hard Wired'],
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'location',
      label: 'Location',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'otherSiteSurveyNotes',
      label: 'Other Site Survey Notes',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    }
  ];

  // Model Details Section Fields
  modelDetailsFields: FieldConfig[] = [
    {
      name: 'fixtureType',
      label: 'Fixture Type',
      type: 'dropdown',
      values: ['Face Fix', 'Top Fix', 'Recess'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'operation',
      label: 'Operation',
      type: 'dropdown',
      values: ['Manual', 'Motorised'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'crankLength',
      label: 'Crank Length',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'operationSide',
      label: 'Operation Side',
      type: 'dropdown',
      values: ['Right', 'Left'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'fabric',
      label: 'Fabric',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'ral',
      label: 'RAL',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'valanceChoice',
      label: 'Valance Choice',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'valance',
      label: 'Valance',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'windSensor',
      label: 'Wind Sensor',
      type: 'dropdown',
      values: ['Vibrabox', 'Anemometer'],
      visibleFor: ['awning', 'roofSystem']
    }
  ];

  // ShadePlus Section Fields
  shadePlusFields: FieldConfig[] = [
    {
      name: 'shadePlusRequired',
      label: 'ShadePlus Required',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'shadeType',
      label: 'Shade Type',
      type: 'dropdown',
      values: ['Manual', 'Motorised'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'shadeplusFabric',
      label: 'Shadeplus Fabric',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'shadePlusAnyOtherDetail',
      label: 'ShadePlus - Any other detail',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    }
  ];

  // Lights Section Fields
  lightsFields: FieldConfig[] = [
    {
      name: 'lights',
      label: 'Lights',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'lightsType',
      label: 'Lights Type',
      type: 'dropdown',
      values: ['Spot Lights', 'LED Line', 'Other'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'lightsAnyOtherDetails',
      label: 'Lights - Any Other Details',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    }
  ];

  // Heater Section Fields
  heaterFields: FieldConfig[] = [
    {
      name: 'heater',
      label: 'Heater',
      type: 'dropdown',
      values: ['Yes', 'No'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterManufacturer',
      label: 'Heater Manufacturer',
      type: 'dropdown',
      values: ['Markilux', 'Bromic', 'Other'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'numberRequired',
      label: 'Number Required',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterOutput',
      label: 'Heater Output',
      type: 'dropdown',
      values: ['2kw', '2.5kw', '3kw', '4kw', '6kw', 'Other'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterColour',
      label: 'Heater Colour',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'remoteControl',
      label: 'Remote Control',
      type: 'dropdown',
      values: ['Handheld', 'Wall Mounted'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'controllerBox',
      label: 'Controller Box',
      type: 'dropdown',
      values: ['On', 'Off', 'Dimmable'],
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterAnyOtherDetails',
      label: 'Heater - Any Other Details',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    }
  ];

  constructor(private fb: FormBuilder) {
    this.siteVisitForm = this.fb.group({
      workflow: ['', Validators.required],
      productModel: [''],
      model: [''],
      otherPleaseSpecify: [''],
      // Product Model Section
      siteLayout: [''],
      structure: [''],
      passageHeight: [''],
      width: [''],
      projection: [''],
      heightAvailable: [''],
      wallType: [''],
      externalInsulation: [''],
      wallFinish: [''],
      wallThickness: [''],
      specialBrackets: [''],
      sideInfills: [''],
      flashingRequired: [''],
      flashingDimensions: [''],
      standOfBrackets: [''],
      standOfBracketDimension: [''],
      electrician: [''],
      electricalConnection: [''],
      location: [''],
      otherSiteSurveyNotes: [''],
      // Model Details Section
      fixtureType: [''],
      operation: [''],
      crankLength: [''],
      operationSide: [''],
      fabric: [''],
      ral: [''],
      valanceChoice: [''],
      valance: [''],
      windSensor: [''],
      // ShadePlus Section
      shadePlusRequired: [''],
      shadeType: [''],
      shadeplusFabric: [''],
      shadePlusAnyOtherDetail: [''],
      // Lights Section
      lights: [''],
      lightsType: [''],
      lightsAnyOtherDetails: [''],
      // Heater Section
      heater: [''],
      heaterManufacturer: [''],
      numberRequired: [''],
      heaterOutput: [''],
      heaterColour: [''],
      remoteControl: [''],
      controllerBox: [''],
      heaterAnyOtherDetails: ['']
    });
  }

  ngOnInit(): void {
    // Subscribe to product model changes
    this.siteVisitForm.get('productModel')?.valueChanges.subscribe(value => {
      const selectedModel = this.productModels.find(e => e.id === value);
      this.selectedProductModel = selectedModel?.key || '';
      
      // Show full tabs only for Awning and Roof System
      this.showFullTabs = this.selectedProductModel === 'awning' || this.selectedProductModel === 'roofSystem';
      
      // Set default tab to product-model when product model changes
      this.activeTab = 'product-model';
    });
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  isFieldVisible(field: FieldConfig): boolean {
    if (!this.selectedProductModel) {
      return false;
    }
    return field.visibleFor.includes(this.selectedProductModel);
  }

  resetForm(): void {
    this.siteVisitForm.reset();
    this.selectedProductModel = '';
    this.showFullTabs = false;
    this.activeTab = 'product-model';
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