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
import { WorkflowStateService } from '../../service/workflow-state.service';

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
  selectedWorkflowId: number | null = null;

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
    { id: '6', name: 'Fabric Wind Breaker', key: 'fabricWindBreaker' },
    { id: '7', name: 'Pergola', key: 'pergola' },
    { id: '8', name: 'Other', key: 'other' }
  ];

  // Product Model Section Fields - Updated based on Excel
  productModelFields: FieldConfig[] = [
    {
      name: 'siteLayout',
      label: 'Site Survey layout',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'structure',
      label: 'Structure',
      type: 'dropdown',
      category: 'Structure',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'passageHeight',
      label: 'Passage Height (m)',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'width',
      label: 'Width (m)',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'projection',
      label: 'Projection (m)',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'heightAvailable',
      label: 'Height Available',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'wallType',
      label: 'Wall Type',
      type: 'dropdown',
      category: 'WallType',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'externalInsulation',
      label: 'External Insulation',
      type: 'dropdown',
      category: 'ExternalInsulation',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'wallFinish',
      label: 'Wall Finish',
      type: 'dropdown',
      category: 'WallFinish',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'wallThickness',
      label: 'Wall Thickness',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'specialBrackets',
      label: 'Special Brackets',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'sideInfills',
      label: 'Side Infills',
      type: 'dropdown',
      category: 'SideInfills',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'flashingRequired',
      label: 'Flashing Required',
      type: 'dropdown',
      category: 'FlashingRequired',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'flashingDimensions',
      label: 'Flashing Dimensions',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'standOfBrackets',
      label: 'Stand of Brackets',
      type: 'dropdown',
      category: 'StandOfBrackets',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'standOfBracketDimension',
      label: 'Stand of Bracket Dimension',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'electrician',
      label: 'Electrician',
      type: 'dropdown',
      category: 'Electrician',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'electricalConnection',
      label: 'Electrical Connection',
      type: 'dropdown',
      category: 'ElectricalConnection',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'location',
      label: 'Location',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    },
    {
      name: 'otherSiteSurveyNotes',
      label: 'Other Site Survey Notes',
      type: 'text',
      visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other']
    }
  ];

  // Model Details Section Fields - Updated based on Excel
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

  // ShadePlus & Lights Combined Section Fields - Updated based on Excel
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
      label: 'ShadePlus - Any other details',
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

  // Heater Section Fields - Updated based on Excel
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
      type: 'text',
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
    private router: Router,
    private workflowStateService: WorkflowStateService,
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

    this.workflows$ = this.workflowsSubject$.asObservable();
    this.siteVisits$ = this.siteVisitsSubject$.asObservable();
    this.dropdownValues$ = this.dropdownValuesSubject$.asObservable();
  }

  ngOnInit(): void {
    // Get customerId from route params
 /**this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['customerId']) {
        this.customerId = +params['customerId'];
        this.loadWorkflows();
      }
    });
 */   
    this.route.queryParams
          .pipe(takeUntil(this.destroy$))
          .subscribe(params => {
            this.customerId = params['customerId'] ? +params['customerId'] : null;
            this.loadWorkflows();
            const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
            let workflowId = 0;
    
            if (!this.customerId) {
              this.errorMessage$.next('No customer selected. Please select a customer first.');
              return;
            }
    
            if (this.customerId) {
              const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
              this.customerId = selectedWorkflow?.customerId || null;
             // this.customerName = selectedWorkflow?.customerName || '';
              this.selectedWorkflowId = selectedWorkflow?.id || 0;
            }
          });
    this.loadDropdownValues();
    this.setupFormSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFormSubscriptions(): void {
    // Watch for workflow selection changes
    this.siteVisitForm.get('workflow')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((workflowId: string) => {
        if (workflowId) {
          this.currentWorkflowId = parseInt(workflowId);
          this.loadSiteVisits(this.currentWorkflowId);
          this.resetForm(); // Reset form when workflow changes
        }
      });

    // Watch for product model changes
    this.siteVisitForm.get('productModel')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((productModelId: string) => {
        const model = this.productModels.find(m => m.id === productModelId);
        if (model) {
          this.selectedProductModel = model.key;
          this.showFullTabs = model.key === 'awning' || model.key === 'roofSystem';
          
          if (this.showFullTabs) {
            this.activeTab = 'product-model';
          }
        } else {
          this.selectedProductModel = '';
          this.showFullTabs = false;
        }
      });
  }

 private loadWorkflows(): void {
  if (!this.customerId) {
    console.warn('No customerId provided');
    return;
  }
  
  this.isLoading$.next(true);
  this.workflowService.getWorkflowsForCustomer(this.customerId) // ✅ Correct method
    .pipe(
      takeUntil(this.destroy$),
      finalize(() => this.isLoading$.next(false))
    )
    .subscribe({
      next: (workflows) => {
        this.workflowsSubject$.next(workflows);
      },
      error: (error) => {
        this.showError('Failed to load workflows: ' + error.message);
      }
    });
}

  private loadSiteVisits(workflowId: number): void {
    this.isLoading$.next(true);
    this.siteVisitService.getSiteVisitsByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe({
        next: (siteVisits) => {
          this.siteVisitsSubject$.next(siteVisits);
        },
        error: (error) => {
          this.showError('Failed to load site visits: ' + error.message);
        }
      });
  }

  private loadDropdownValues(): void {
    this.siteVisitService.getAllDropdownValues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (values) => {
          this.dropdownValuesSubject$.next(values);
        },
        error: (error) => {
          console.error('Failed to load dropdown values:', error);
        }
      });
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  isFieldVisible(field: FieldConfig): boolean {
    return field.visibleFor.includes(this.selectedProductModel);
  }

  getFieldValues(field: FieldConfig): string[] {
    if (field.values) {
      return field.values;
    }
    
    if (field.category) {
      const dropdownValues = this.dropdownValuesSubject$.getValue();
      return dropdownValues[field.category] || [];
    }
    
    return [];
  }

  getProductModelName(productModelType: string): string {
    const model = this.productModels.find(m => m.key === productModelType);
    return model ? model.name : productModelType;
  }

  editSiteVisit(siteVisit: SiteVisitDto): void {
    this.editMode = true;
    this.editingSiteVisitId = siteVisit.siteVisitId!;
    
    // Find and set the product model
    const model = this.productModels.find(m => m.name === siteVisit.productModelType);
    if (model) {
      this.siteVisitForm.patchValue({
        productModel: model.id
      });
    }
    
    // Patch all form values
    this.siteVisitForm.patchValue({
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
  }

  deleteSiteVisit(siteVisitId: number): void {
    if (confirm('Are you sure you want to delete this site visit?')) {
      this.siteVisitService.deleteSiteVisit(siteVisitId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.showSuccess('Site visit deleted successfully');
            if (this.currentWorkflowId) {
              this.loadSiteVisits(this.currentWorkflowId);
            }
          },
          error: (error) => {
            this.showError('Failed to delete site visit: ' + error.message);
          }
        });
    }
  }

  onSubmit(): void {
    if (!this.currentWorkflowId) {
      this.showError('Please select a workflow');
      return;
    }

    if (!this.siteVisitForm.get('productModel')?.value) {
      this.showError('Please select a product model');
      return;
    }

    this.isSaving$.next(true);
    const formValue = this.siteVisitForm.value;
    
    // Get product model name
    const model = this.productModels.find(m => m.id === formValue.productModel);
    const productModelType = model ? model.name : '';

    if (this.editMode && this.editingSiteVisitId) {
      // Update existing site visit
      const updateDto: SiteVisitDto = {
        siteVisitId: this.editingSiteVisitId,
        workflowId: this.currentWorkflowId,
        productModelType: productModelType,
        ...formValue
      };

      this.siteVisitService.updateSiteVisit(this.editingSiteVisitId, updateDto)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.isSaving$.next(false))
        )
        .subscribe({
          next: () => {
            this.showSuccess('Site visit updated successfully');
            this.resetForm();
            if (this.currentWorkflowId) {
              this.loadSiteVisits(this.currentWorkflowId);
            }
          },
          error: (error) => {
            this.showError('Failed to update site visit: ' + error.message);
          }
        });
    } else {
      // Create new site visit
      const createDto: CreateSiteVisitDto = {
        workflowId: this.currentWorkflowId,
        productModelType: productModelType,
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
          finalize(() => this.isSaving$.next(false))
        )
        .subscribe({
          next: () => {
            this.showSuccess('Site visit created successfully');
            this.resetForm();
            if (this.currentWorkflowId) {
              this.loadSiteVisits(this.currentWorkflowId);
            }
          },
          error: (error) => {
            this.showError('Failed to create site visit: ' + error.message);
          }
        });
    }
  }

  resetForm(): void {
    this.editMode = false;
    this.editingSiteVisitId = null;
    
    // Reset all fields except workflow
    const currentWorkflow = this.siteVisitForm.get('workflow')?.value;
    this.siteVisitForm.reset({
      workflow: currentWorkflow
    });
    
    this.selectedProductModel = '';
    this.showFullTabs = false;
    this.activeTab = 'product-model';
  }

  private showSuccess(message: string): void {
    this.successMessage$.next(message);
    setTimeout(() => this.successMessage$.next(''), 5000);
  }

  private showError(message: string): void {
    this.errorMessage$.next(message);
    setTimeout(() => this.errorMessage$.next(''), 5000);
  }
}