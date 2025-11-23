import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil, tap, catchError, finalize } from 'rxjs/operators';
import { 
  SetupSiteVisitService, 
  CreateSiteVisitDto, 
  SiteVisitDto,
  SiteVisitDropdownValues
} from '../../service/setup-site-visit.service';
import { WorkflowService, WorkflowDto } from '../../service/workflow.service';

interface ProductModel {
  id: string;
  name: string;
  key: string;
}

interface FieldConfig {
  name: string;
  label: string;
  type: 'dropdown' | 'text' | 'checkbox' | 'number';
  category?: string; // For dropdown values from DB
  values?: string[]; // For hardcoded values
  visibleFor: string[];
}

@Component({
  selector: 'app-setup-site-visit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './setup-site-visit.component.html',
  styleUrl: './setup-site-visit.component.scss'
})
export class SetupSiteVisitComponent implements OnInit, OnDestroy {
  siteVisitForm: FormGroup;
  activeTab: string = 'product-model';
  selectedProductModel: string = '';
  showFullTabs: boolean = false;
  
  // Observables for async data
  workflows$!: Observable<WorkflowDto[]>;
  siteVisits$!: Observable<SiteVisitDto[]>;
  dropdownValues$!: Observable<SiteVisitDropdownValues>;
  
  // BehaviorSubjects for state management
  private workflowsSubject$ = new BehaviorSubject<WorkflowDto[]>([]);
  private siteVisitsSubject$ = new BehaviorSubject<SiteVisitDto[]>([]);
  private dropdownValuesSubject$ = new BehaviorSubject<SiteVisitDropdownValues>({});
  
  isLoading$ = new BehaviorSubject<boolean>(false);
  isSaving$ = new BehaviorSubject<boolean>(false);
  errorMessage$ = new BehaviorSubject<string>('');
  successMessage$ = new BehaviorSubject<string>('');
  
  currentWorkflowId: number | null = null;
  customerId: number | null = null;
  editMode = false;
  editingSiteVisitId: number | null = null;
  
  private destroy$ = new Subject<void>();

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

  // Product Model Section Fields
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
      category: 'Structure',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'passageHeight',
      label: 'Passage Height (m)',
      type: 'number',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'width',
      label: 'Width (m)',
      type: 'number',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'projection',
      label: 'Projection (m)',
      type: 'number',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol', 'glassScreen']
    },
    {
      name: 'heightAvailable',
      label: 'Height Available',
      type: 'number',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'wallType',
      label: 'Wall Type',
      type: 'dropdown',
      category: 'WallType',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'externalInsulation',
      label: 'External Insulation',
      type: 'dropdown',
      category: 'ExternalInsulation',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'wallFinish',
      label: 'Wall Finish',
      type: 'dropdown',
      category: 'WallFinish',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'wallThickness',
      label: 'Wall Thickness',
      type: 'number',
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
      category: 'FlashingRequired',
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
      category: 'StandOfBrackets',
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
      category: 'Electrician',
      visibleFor: ['awning', 'roofSystem', 'blind', 'parasol']
    },
    {
      name: 'electricalConnection',
      label: 'Electrical Connection',
      type: 'dropdown',
      category: 'ElectricalConnection',
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
      category: 'FixtureType',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'operation',
      label: 'Operation',
      type: 'dropdown',
      category: 'Operation',
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
      category: 'OperationSide',
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
      category: 'ValanceChoice',
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
      category: 'WindSensor',
      visibleFor: ['awning', 'roofSystem']
    }
  ];

  // ShadePlus & Lights Combined Section Fields
  shadePlusLightsFields: FieldConfig[] = [
    // ShadePlus
    {
      name: 'shadePlusRequired',
      label: 'ShadePlus Required',
      type: 'dropdown',
      category: 'ShadePlusRequired',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'shadeType',
      label: 'Shade Type',
      type: 'dropdown',
      category: 'ShadeType',
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
    },
    // Lights
    {
      name: 'lights',
      label: 'Lights',
      type: 'dropdown',
      category: 'Lights',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'lightsType',
      label: 'Lights Type',
      type: 'dropdown',
      category: 'LightsType',
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
      category: 'Heater',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterManufacturer',
      label: 'Heater Manufacturer',
      type: 'dropdown',
      category: 'HeaterManufacturer',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'numberRequired',
      label: 'Number Required',
      type: 'number',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterOutput',
      label: 'Heater Output',
      type: 'dropdown',
      category: 'HeaterOutput',
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
      category: 'RemoteControl',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'controllerBox',
      label: 'Controller Box',
      type: 'dropdown',
      category: 'ControllerBox',
      visibleFor: ['awning', 'roofSystem']
    },
    {
      name: 'heaterAnyOtherDetails',
      label: 'Heater - Any Other Details',
      type: 'text',
      visibleFor: ['awning', 'roofSystem']
    }
  ];

  constructor(
    private fb: FormBuilder,
    private siteVisitService: SetupSiteVisitService,
    private workflowService: WorkflowService,
    private route: ActivatedRoute,
    private router: Router
  ) {
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
    console.log('📄 Setup Site Visit Component Initialized');
    
    // Initialize observables
    this.workflows$ = this.workflowsSubject$.asObservable();
    this.siteVisits$ = this.siteVisitsSubject$.asObservable();
    this.dropdownValues$ = this.dropdownValuesSubject$.asObservable();
    
    // Load dropdown values
    this.loadDropdownValues();
    
    // Get customer ID and workflow ID from route
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? +params['customerId'] : null;
        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        
        if (this.customerId) {
          this.loadWorkflows(this.customerId, paramWorkflowId);
        }
      });

    // Subscribe to product model changes
    this.siteVisitForm.get('productModel')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        const selectedModel = this.productModels.find(e => e.id === value);
        this.selectedProductModel = selectedModel?.key || '';
        
        // Show full tabs only for Awning and Roof System
        this.showFullTabs = this.selectedProductModel === 'awning' || this.selectedProductModel === 'roofSystem';
        
        // Set default tab to product-model when product model changes
        this.activeTab = 'product-model';
      });

    // Subscribe to workflow changes
    this.siteVisitForm.get('workflow')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(workflowId => {
        if (workflowId) {
          this.currentWorkflowId = +workflowId;
          this.loadSiteVisitsGrid(this.currentWorkflowId);
        } else {
          this.siteVisitsSubject$.next([]);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDropdownValues(): void {
    console.log('📥 Loading dropdown values...');
    
    this.siteVisitService.getAllDropdownValues()
      .pipe(
        takeUntil(this.destroy$),
        tap(values => {
          console.log('✅ Dropdown values loaded:', Object.keys(values).length);
          this.dropdownValuesSubject$.next(values);
        }),
        catchError(error => {
          console.error('❌ Error loading dropdown values:', error);
          this.errorMessage$.next('Failed to load dropdown values');
          this.clearMessagesAfterDelay();
          return [];
        })
      )
      .subscribe();
  }

  loadWorkflows(customerId: number, preselectedWorkflowId: number | null = null): void {
    console.log('📄 Loading workflows for customer:', customerId);
    this.isLoading$.next(true);
    
    this.workflowService.getWorkflowsForCustomer(customerId)
      .pipe(
        takeUntil(this.destroy$),
        tap(workflows => {
          console.log('✅ Workflows loaded:', workflows?.length);
          this.workflowsSubject$.next(workflows || []);
          
          // Auto-select workflow if provided in query params
          if (preselectedWorkflowId && workflows.some(w => w.workflowId === preselectedWorkflowId)) {
            this.siteVisitForm.patchValue({
              workflow: preselectedWorkflowId.toString()
            }, { emitEvent: false });
            this.currentWorkflowId = preselectedWorkflowId;
            this.loadSiteVisitsGrid(preselectedWorkflowId);
          } else if (workflows.length === 1) {
            // Auto-select if only one workflow
            this.siteVisitForm.patchValue({
              workflow: workflows[0].workflowId.toString()
            }, { emitEvent: false });
            this.currentWorkflowId = workflows[0].workflowId;
            this.loadSiteVisitsGrid(workflows[0].workflowId);
          }
        }),
        catchError(error => {
          console.error('❌ Error loading workflows:', error);
          this.errorMessage$.next('Failed to load workflows. Please try again.');
          this.clearMessagesAfterDelay();
          return [];
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  loadSiteVisitsGrid(workflowId: number): void {
    console.log('📄 Loading site visits for workflow:', workflowId);
    this.isLoading$.next(true);
    
    this.siteVisitService.getSiteVisitsByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        tap(siteVisits => {
          console.log('✅ Site visits loaded:', siteVisits?.length);
          this.siteVisitsSubject$.next(siteVisits || []);
        }),
        catchError(error => {
          console.error('❌ Error loading site visits:', error);
          this.errorMessage$.next('Failed to load site visits.');
          this.clearMessagesAfterDelay();
          this.siteVisitsSubject$.next([]);
          return [];
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  getFieldValues(field: FieldConfig): string[] {
    if (field.values) {
      return field.values;
    }
    
    if (field.category) {
      const dropdownValues = this.dropdownValuesSubject$.value;
      return dropdownValues[field.category] || [];
    }
    
    return [];
  }

  editSiteVisit(siteVisit: SiteVisitDto): void {
    console.log('📝 Loading site visit for edit:', siteVisit.siteVisitId);
    this.editMode = true;
    this.editingSiteVisitId = siteVisit.siteVisitId || 0;
    
    // Find product model by key
    const productModel = this.productModels.find(pm => pm.key === siteVisit.productModelType);
    
    this.siteVisitForm.patchValue({
      workflow: siteVisit.workflowId?.toString(),
      productModel: productModel?.id,
      model: siteVisit.model,
      otherPleaseSpecify: siteVisit.otherPleaseSpecify,
      siteLayout: siteVisit.siteLayout,
      structure: siteVisit.structure,
      passageHeight: siteVisit.passageHeight,
      width: siteVisit.width,
      projection: siteVisit.projection,
      heightAvailable: siteVisit.heightAvailable,
      wallType: siteVisit.wallType,
      externalInsulation: siteVisit.externalInsulation,
      wallFinish: siteVisit.wallFinish,
      wallThickness: siteVisit.wallThickness,
      specialBrackets: siteVisit.specialBrackets,
      sideInfills: siteVisit.sideInfills,
      flashingRequired: siteVisit.flashingRequired,
      flashingDimensions: siteVisit.flashingDimensions,
      standOfBrackets: siteVisit.standOfBrackets,
      standOfBracketDimension: siteVisit.standOfBracketDimension,
      electrician: siteVisit.electrician,
      electricalConnection: siteVisit.electricalConnection,
      location: siteVisit.location,
      otherSiteSurveyNotes: siteVisit.otherSiteSurveyNotes,
      fixtureType: siteVisit.fixtureType,
      operation: siteVisit.operation,
      crankLength: siteVisit.crankLength,
      operationSide: siteVisit.operationSide,
      fabric: siteVisit.fabric,
      ral: siteVisit.ral,
      valanceChoice: siteVisit.valanceChoice,
      valance: siteVisit.valance,
      windSensor: siteVisit.windSensor,
      shadePlusRequired: siteVisit.shadePlusRequired,
      shadeType: siteVisit.shadeType,
      shadeplusFabric: siteVisit.shadeplusFabric,
      shadePlusAnyOtherDetail: siteVisit.shadePlusAnyOtherDetail,
      lights: siteVisit.lights,
      lightsType: siteVisit.lightsType,
      lightsAnyOtherDetails: siteVisit.lightsAnyOtherDetails,
      heater: siteVisit.heater,
      heaterManufacturer: siteVisit.heaterManufacturer,
      numberRequired: siteVisit.numberRequired,
      heaterOutput: siteVisit.heaterOutput,
      heaterColour: siteVisit.heaterColour,
      remoteControl: siteVisit.remoteControl,
      controllerBox: siteVisit.controllerBox,
      heaterAnyOtherDetails: siteVisit.heaterAnyOtherDetails
    });
    
    // Scroll to form section
    const formElement = document.querySelector('.site-visit-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  deleteSiteVisit(siteVisitId: number): void {
    if (!confirm('Are you sure you want to delete this site visit?')) {
      return;
    }

    console.log('🗑️ Deleting site visit:', siteVisitId);
    this.isLoading$.next(true);
    
    this.siteVisitService.deleteSiteVisit(siteVisitId)
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          console.log('✅ Site visit deleted successfully');
          this.successMessage$.next('Site visit deleted successfully!');
          this.clearMessagesAfterDelay();
          
          // Reload the grid
          if (this.currentWorkflowId) {
            this.loadSiteVisitsGrid(this.currentWorkflowId);
          }
        }),
        catchError(error => {
          console.error('❌ Error deleting site visit:', error);
          this.errorMessage$.next(error.message || 'Failed to delete site visit. Please try again.');
          this.clearMessagesAfterDelay();
          return [];
        }),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe();
  }

  getProductModelName(productModelType: string): string {
    const model = this.productModels.find(pm => pm.key === productModelType);
    return model ? model.name : productModelType;
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
    const currentWorkflowId = this.siteVisitForm.get('workflow')?.value;
    
    this.siteVisitForm.reset({
      workflow: currentWorkflowId
    });
    
    this.selectedProductModel = '';
    this.showFullTabs = false;
    this.activeTab = 'product-model';
    this.editMode = false;
    this.editingSiteVisitId = null;
    this.errorMessage$.next('');
    this.successMessage$.next('');
    
    // Scroll to product model selection
    const productModelSection = document.querySelector('.form-section');
    if (productModelSection) {
      productModelSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  onSubmit(): void {
    if (this.siteVisitForm.valid) {
      if (this.editMode && this.editingSiteVisitId) {
        this.updateSiteVisit();
      } else {
        this.createSiteVisit();
      }
    } else {
      this.markFormGroupTouched(this.siteVisitForm);
      this.errorMessage$.next('Please fill in all required fields.');
      this.clearMessagesAfterDelay();
    }
  }

  createSiteVisit(): void {
    console.log('💾 Creating site visit...');
    this.isSaving$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    const formValue = this.siteVisitForm.value;
    const createDto: CreateSiteVisitDto = {
      workflowId: +formValue.workflow,
      productModelType: this.selectedProductModel,
      model: formValue.model,
      otherPleaseSpecify: formValue.otherPleaseSpecify,
      siteLayout: formValue.siteLayout,
      structure: formValue.structure,
      passageHeight: formValue.passageHeight,
      width: formValue.width,
      projection: formValue.projection,
      heightAvailable: formValue.heightAvailable,
      wallType: formValue.wallType,
      externalInsulation: formValue.externalInsulation,
      wallFinish: formValue.wallFinish,
      wallThickness: formValue.wallThickness,
      specialBrackets: formValue.specialBrackets,
      sideInfills: formValue.sideInfills,
      flashingRequired: formValue.flashingRequired,
      flashingDimensions: formValue.flashingDimensions,
      standOfBrackets: formValue.standOfBrackets,
      standOfBracketDimension: formValue.standOfBracketDimension,
      electrician: formValue.electrician,
      electricalConnection: formValue.electricalConnection,
      location: formValue.location,
      otherSiteSurveyNotes: formValue.otherSiteSurveyNotes,
      fixtureType: formValue.fixtureType,
      operation: formValue.operation,
      crankLength: formValue.crankLength,
      operationSide: formValue.operationSide,
      fabric: formValue.fabric,
      ral: formValue.ral,
      valanceChoice: formValue.valanceChoice,
      valance: formValue.valance,
      windSensor: formValue.windSensor,
      shadePlusRequired: formValue.shadePlusRequired,
      shadeType: formValue.shadeType,
      shadeplusFabric: formValue.shadeplusFabric,
      shadePlusAnyOtherDetail: formValue.shadePlusAnyOtherDetail,
      lights: formValue.lights,
      lightsType: formValue.lightsType,
      lightsAnyOtherDetails: formValue.lightsAnyOtherDetails,
      heater: formValue.heater,
      heaterManufacturer: formValue.heaterManufacturer,
      numberRequired: formValue.numberRequired,
      heaterOutput: formValue.heaterOutput,
      heaterColour: formValue.heaterColour,
      remoteControl: formValue.remoteControl,
      controllerBox: formValue.controllerBox,
      heaterAnyOtherDetails: formValue.heaterAnyOtherDetails
    };

    this.siteVisitService.createSiteVisit(createDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(response => {
          console.log('✅ Site visit created successfully:', response);
          this.successMessage$.next('Site visit saved successfully!');
          this.clearMessagesAfterDelay();
          
          // Reset form but keep workflow selected
          this.resetForm();
          
          // Reload the grid
          if (this.currentWorkflowId) {
            this.loadSiteVisitsGrid(this.currentWorkflowId);
          }
        }),
        catchError(error => {
          console.error('❌ Error creating site visit:', error);
          this.errorMessage$.next(error.message || 'Failed to save site visit. Please try again.');
          this.clearMessagesAfterDelay();
          return [];
        }),
        finalize(() => this.isSaving$.next(false))
      )
      .subscribe();
  }

  updateSiteVisit(): void {
    if (!this.editingSiteVisitId) return;
    
    console.log('📝 Updating site visit:', this.editingSiteVisitId);
    this.isSaving$.next(true);
    this.errorMessage$.next('');
    this.successMessage$.next('');

    const formValue = this.siteVisitForm.value;
    const updateDto: SiteVisitDto = {
      siteVisitId: this.editingSiteVisitId,
      workflowId: +formValue.workflow,
      productModelType: this.selectedProductModel,
      model: formValue.model,
      otherPleaseSpecify: formValue.otherPleaseSpecify,
      siteLayout: formValue.siteLayout,
      structure: formValue.structure,
      passageHeight: formValue.passageHeight,
      width: formValue.width,
      projection: formValue.projection,
      heightAvailable: formValue.heightAvailable,
      wallType: formValue.wallType,
      externalInsulation: formValue.externalInsulation,
      wallFinish: formValue.wallFinish,
      wallThickness: formValue.wallThickness,
      specialBrackets: formValue.specialBrackets,
      sideInfills: formValue.sideInfills,
      flashingRequired: formValue.flashingRequired,
      flashingDimensions: formValue.flashingDimensions,
      standOfBrackets: formValue.standOfBrackets,
      standOfBracketDimension: formValue.standOfBracketDimension,
      electrician: formValue.electrician,
      electricalConnection: formValue.electricalConnection,
      location: formValue.location,
      otherSiteSurveyNotes: formValue.otherSiteSurveyNotes,
      fixtureType: formValue.fixtureType,
      operation: formValue.operation,
      crankLength: formValue.crankLength,
      operationSide: formValue.operationSide,
      fabric: formValue.fabric,
      ral: formValue.ral,
      valanceChoice: formValue.valanceChoice,
      valance: formValue.valance,
      windSensor: formValue.windSensor,
      shadePlusRequired: formValue.shadePlusRequired,
      shadeType: formValue.shadeType,
      shadeplusFabric: formValue.shadeplusFabric,
      shadePlusAnyOtherDetail: formValue.shadePlusAnyOtherDetail,
      lights: formValue.lights,
      lightsType: formValue.lightsType,
      lightsAnyOtherDetails: formValue.lightsAnyOtherDetails,
      heater: formValue.heater,
      heaterManufacturer: formValue.heaterManufacturer,
      numberRequired: formValue.numberRequired,
      heaterOutput: formValue.heaterOutput,
      heaterColour: formValue.heaterColour,
      remoteControl: formValue.remoteControl,
      controllerBox: formValue.controllerBox,
      heaterAnyOtherDetails: formValue.heaterAnyOtherDetails
    };

    this.siteVisitService.updateSiteVisit(this.editingSiteVisitId, updateDto)
      .pipe(
        takeUntil(this.destroy$),
        tap(response => {
          console.log('✅ Site visit updated successfully:', response);
          this.successMessage$.next('Site visit updated successfully!');
          this.clearMessagesAfterDelay();
          
          // Reset form but keep workflow selected
          this.resetForm();
          
          // Reload the grid
          if (this.currentWorkflowId) {
            this.loadSiteVisitsGrid(this.currentWorkflowId);
          }
        }),
        catchError(error => {
          console.error('❌ Error updating site visit:', error);
          this.errorMessage$.next(error.message || 'Failed to update site visit. Please try again.');
          this.clearMessagesAfterDelay();
          return [];
        }),
        finalize(() => this.isSaving$.next(false))
      )
      .subscribe();
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  private clearMessagesAfterDelay(): void {
    setTimeout(() => {
      this.successMessage$.next('');
      this.errorMessage$.next('');
    }, 5000);
  }
}