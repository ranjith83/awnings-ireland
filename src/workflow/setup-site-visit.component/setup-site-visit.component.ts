import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { takeUntil, tap, catchError, finalize, switchMap } from 'rxjs/operators';
import {
  SetupSiteVisitService,
  CreateSiteVisitDto,
  SiteVisitDto,
  SiteVisitDropdownValues
} from '../../service/setup-site-visit.service';
import { WorkflowService, WorkflowDto } from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';
import { OutlookCalendarService, ShowroomInvite } from '../../service/outlook-calendar.service';

interface ProductModel {
  id: string;
  name: string;
  key: string;
}

interface FieldConfig {
  name: string;
  label: string;
  type: 'dropdown' | 'text' | 'checkbox' | 'number';
  category?: string;
  values?: string[];
  visibleFor: string[];
}

// ── Calendar types ────────────────────────────────────────────────────────────

export interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFree: boolean;
  isBusy: boolean;
  isSelected: boolean;
  isPast: boolean;
  events: CalendarEvent[];
}

export interface CalendarEvent {
  subject: string;
  start: string;
  end: string;
}

import { NotificationService } from '../../service/notification.service';
@Component({
  selector: 'app-setup-site-visit',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
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
  
  
  
  currentWorkflowId: number | null = null;
  customerId: number | null = null;
  customerEmail: string | null = null;
  customerName: string | null = null;
  editMode = false;
  editingSiteVisitId: number | null = null;
  showForm = false;
  
  private destroy$ = new Subject<void>();

  // ── Calendar state ──────────────────────────────────────────────────────────
  showCalendar = false;
  calendarLoading$ = new BehaviorSubject<boolean>(false);
  calendarStreaming$ = new BehaviorSubject<boolean>(false);
  calendarStreamedCount$ = new BehaviorSubject<number>(0);
  calendarError$ = new BehaviorSubject<string>('');
  calendarViewDate: Date = new Date();
  calendarWeeks$ = new BehaviorSubject<CalendarDay[][]>([]);
  selectedDate: Date | null = null;
  selectedDateEvents$ = new BehaviorSubject<CalendarEvent[]>([]);
 
  /** Accumulated raw events; grows as each response page is processed */
  private calendarEvents$ = new BehaviorSubject<any[]>([]);

  /** Cancels any in-flight calendar request when navigating months or closing */
  private cancelCalendar$ = new Subject<void>();

  // ── Calendar event creation modal ──────────────────────────────────────────
  showAddEventModal = false;
  newEventForm = { subject: '', date: '', startTime: '', endTime: '' };
  isCreatingEvent$ = new BehaviorSubject<boolean>(false);
  createEventError$ = new BehaviorSubject<string>('');
  createEventSuccess$ = new BehaviorSubject<string>('');

  readonly modalTimeSlots: string[] = [
    '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
    '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
    '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM'
  ];

  modalStartSlots: { slot: string; isBusy: boolean }[] = [];
  modalEndSlots: { slot: string; isBusy: boolean }[] = [];

  // ── Image upload (Images tab) ──────────────────────────────────────────────
  selectedImages: File[] = [];        // new files pending upload
  existingImageUrls: string[] = [];   // URLs already saved on the server
  deletedImageUrls: string[] = [];    // URLs the user has removed (to send to backend)

  readonly WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

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

  productModelFields: FieldConfig[] = [
    { name: 'structure', label: 'Structure', type: 'dropdown', category: 'Structure', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'passageHeight', label: 'Passage Height (m)', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'width', label: 'Width (m)', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'projection', label: 'Projection (m)', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'heightAvailable', label: 'Height Available', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'wallType', label: 'Wall Type', type: 'dropdown', category: 'WallType', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'externalInsulation', label: 'External Insulation', type: 'dropdown', category: 'ExternalInsulation', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'wallFinish', label: 'Wall Finish', type: 'dropdown', category: 'WallFinish', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'wallThickness', label: 'Wall Thickness', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'specialBrackets', label: 'Special Brackets', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'sideInfills', label: 'Side Infills', type: 'dropdown', category: 'SideInfills', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'flashingRequired', label: 'Flashing Required', type: 'dropdown', category: 'FlashingRequired', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'flashingDimensions', label: 'Flashing Dimensions', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'standOfBrackets', label: 'Stand of Brackets', type: 'dropdown', category: 'StandOfBrackets', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'standOfBracketDimension', label: 'Stand of Bracket Dimension', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'electrician', label: 'Electrician', type: 'dropdown', category: 'Electrician', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'electricalConnection', label: 'Electrical Connection', type: 'dropdown', category: 'ElectricalConnection', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'location', label: 'Location', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] },
    { name: 'otherSiteSurveyNotes', label: 'Other Site Survey Notes', type: 'text', visibleFor: ['awning', 'roofSystem', 'blind', 'glassScreen', 'pergola', 'fabricWindBreaker', 'parasol', 'other'] }
  ];

  modelDetailsFields: FieldConfig[] = [
    { name: 'fixtureType', label: 'Fixture Type', type: 'dropdown', category: 'FixtureType', visibleFor: ['awning', 'roofSystem'] },
    { name: 'operation', label: 'Operation', type: 'dropdown', category: 'Operation', visibleFor: ['awning', 'roofSystem'] },
    { name: 'crankLength', label: 'Crank Length', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'operationSide', label: 'Operation Side', type: 'dropdown', category: 'OperationSide', visibleFor: ['awning', 'roofSystem'] },
    { name: 'fabric', label: 'Fabric', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'ral', label: 'RAL', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'valanceChoice', label: 'Valance Choice', type: 'dropdown', category: 'ValanceChoice', visibleFor: ['awning', 'roofSystem'] },
    { name: 'valance', label: 'Valance', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'windSensor', label: 'Wind Sensor', type: 'dropdown', category: 'WindSensor', visibleFor: ['awning', 'roofSystem'] }
  ];

  shadePlusLightsFields: FieldConfig[] = [
    { name: 'shadePlusRequired', label: 'ShadePlus Required', type: 'dropdown', category: 'ShadePlusRequired', visibleFor: ['awning', 'roofSystem'] },
    { name: 'shadeType', label: 'Shade Type', type: 'dropdown', category: 'ShadeType', visibleFor: ['awning', 'roofSystem'] },
    { name: 'shadeplusFabric', label: 'Shadeplus Fabric', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'shadePlusAnyOtherDetail', label: 'ShadePlus - Any other details', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'lights', label: 'Lights', type: 'dropdown', category: 'Lights', visibleFor: ['awning', 'roofSystem'] },
    { name: 'lightsType', label: 'Lights Type', type: 'dropdown', category: 'LightsType', visibleFor: ['awning', 'roofSystem'] },
    { name: 'lightsAnyOtherDetails', label: 'Lights - Any Other Details', type: 'text', visibleFor: ['awning', 'roofSystem'] }
  ];

  heaterFields: FieldConfig[] = [
    { name: 'heater', label: 'Heater', type: 'dropdown', category: 'Heater', visibleFor: ['awning', 'roofSystem'] },
    { name: 'heaterManufacturer', label: 'Heater Manufacturer', type: 'dropdown', category: 'HeaterManufacturer', visibleFor: ['awning', 'roofSystem'] },
    { name: 'numberRequired', label: 'Number Required', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'heaterOutput', label: 'Heater Output', type: 'dropdown', category: 'HeaterOutput', visibleFor: ['awning', 'roofSystem'] },
    { name: 'heaterColour', label: 'Heater Colour', type: 'text', visibleFor: ['awning', 'roofSystem'] },
    { name: 'remoteControl', label: 'Remote Control', type: 'dropdown', category: 'RemoteControl', visibleFor: ['awning', 'roofSystem'] },
    { name: 'controllerBox', label: 'Controller Box', type: 'dropdown', category: 'ControllerBox', visibleFor: ['awning', 'roofSystem'] },
    { name: 'heaterAnyOtherDetails', label: 'Heater - Any Other Details', type: 'text', visibleFor: ['awning', 'roofSystem'] }
  ];

  constructor(
    private fb: FormBuilder,
    private siteVisitService: SetupSiteVisitService,
    private workflowService: WorkflowService,
    private route: ActivatedRoute,
    private router: Router,
    private workflowStateService: WorkflowStateService,
    private outlookCalendarService: OutlookCalendarService,
    private notificationService: NotificationService) {
    this.siteVisitForm = this.fb.group({
      workflow: ['', Validators.required],
      productModel: [''],
      model: [''],
      otherPleaseSpecify: [''],
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
      fixtureType: [''],
      operation: [''],
      crankLength: [''],
      operationSide: [''],
      fabric: [''],
      ral: [''],
      valanceChoice: [''],
      valance: [''],
      windSensor: [''],
      shadePlusRequired: [''],
      shadeType: [''],
      shadeplusFabric: [''],
      shadePlusAnyOtherDetail: [''],
      lights: [''],
      lightsType: [''],
      lightsAnyOtherDetails: [''],
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
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? +params['customerId'] : null;
        const paramWorkflowId = params['workflowId'] ? +params['workflowId'] : null;
        const paramSiteVisitId = params['siteVisitId'] ? +params['siteVisitId'] : null;
        this.customerEmail = params['customerEmail'] || 'customer@example.com';
        this.customerName = params['customerName'] || 'Customer';

        if (!this.customerId) {
          this.notificationService.error('No customer selected. Please select a customer first.');
          return;
        }

        // Resolve customerId/workflowId from workflow state service if available
        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        this.customerId = selectedWorkflow?.customerId || this.customerId;
        this.selectedWorkflowId = selectedWorkflow?.id || paramWorkflowId || 0;

        this.loadWorkflows();

        // If a workflowId came via query params, pre-select the workflow dropdown
        // and optionally open the matching site visit for editing
        if (paramWorkflowId) {
          const wfSub = this.workflowsSubject$.subscribe(wfs => {
            if (wfs.length > 0) {
              this.siteVisitForm.get('workflow')?.setValue(paramWorkflowId, { emitEvent: true });
              this.currentWorkflowId = paramWorkflowId;

              // If a specific siteVisitId was passed, find and populate it for editing
              if (paramSiteVisitId) {
                this.loadSiteVisitById(paramWorkflowId, paramSiteVisitId);
              }
              wfSub.unsubscribe();
            }
          });
        }
      });
    this.loadDropdownValues();
    this.setupFormSubscriptions();
  }

  /**
   * Loads site visits for the given workflow, finds the one matching siteVisitId,
   * and calls editSiteVisit() to pre-populate the form — mirrors the flow used
   * when the user clicks ✏️ Edit directly on the setup-site-visit page.
   */
  private loadSiteVisitById(workflowId: number, siteVisitId: number): void {
    this.isLoading$.next(true);
    this.siteVisitService.getSiteVisitsByWorkflowId(workflowId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading$.next(false))
      )
      .subscribe({
        next: (siteVisits) => {
          this.siteVisitsSubject$.next(siteVisits);
          const target = siteVisits.find(sv => sv.siteVisitId === siteVisitId);
          if (target) {
            this.editSiteVisit(target);
          } else {
            this.showError(`Site visit #${siteVisitId} not found for this workflow.`);
          }
        },
        error: (error) => this.showError('Failed to load site visit: ' + error.message)
      });
  }

  ngOnDestroy(): void {
    this.cancelCalendar$.next();
    this.cancelCalendar$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFormSubscriptions(): void {
    // Workflow change subscription (preserve original logic)
    this.siteVisitForm.get('workflow')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(workflowId => {
        if (workflowId) {
          this.currentWorkflowId = +workflowId;
          this.loadSiteVisits(this.currentWorkflowId);
          this.resetFormWithoutEvent();
        } else {
          this.currentWorkflowId = null;
          this.siteVisitsSubject$.next([]);
        }
      });

    // Product model change subscription
    this.siteVisitForm.get('productModel')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(modelId => {
        const model = this.productModels.find(m => m.id === modelId);
        if (model) {
          this.selectedProductModel = model.key;
          this.showFullTabs = model.key === 'awning' || model.key === 'roofSystem';
          this.activeTab = 'product-model';
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
        next: (siteVisits) => this.siteVisitsSubject$.next(siteVisits),
        error: (error) => this.showError('Failed to load site visits: ' + error.message)
      });
  }

  private loadDropdownValues(): void {
    this.siteVisitService.getAllDropdownValues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (values) => this.dropdownValuesSubject$.next(values),
        error: (error) => console.error('Failed to load dropdown values:', error)
      });
  }

  // ── Calendar methods ────────────────────────────────────────────────────────

  toggleCalendar(): void {
    this.showCalendar = !this.showCalendar;
    if (this.showCalendar && this.calendarWeeks$.getValue().length === 0) {
      this.loadCalendarMonth(this.calendarViewDate);
    }
  }

  closeCalendar(): void {
    this.cancelCalendar$.next();
    this.calendarLoading$.next(false);
    this.calendarStreaming$.next(false);
    this.showCalendar = false;
  }

  get calendarMonthLabel(): string {
    return `${this.MONTHS[this.calendarViewDate.getMonth()]} ${this.calendarViewDate.getFullYear()}`;
  }

  prevMonth(): void {
    const d = new Date(this.calendarViewDate);
    d.setMonth(d.getMonth() - 1);
    this.calendarViewDate = d;
    this.selectedDate = null;
    this.selectedDateEvents$.next([]);
    this.loadCalendarMonth(d);
  }

  nextMonth(): void {
    const d = new Date(this.calendarViewDate);
    d.setMonth(d.getMonth() + 1);
    this.calendarViewDate = d;
    this.selectedDate = null;
    this.selectedDateEvents$.next([]);
    this.loadCalendarMonth(d);
  }

  loadCalendarMonth(viewDate: Date): void {
    // Cancel any previous in-flight request
    this.cancelCalendar$.next();

    // Reset state
    this.calendarLoading$.next(true);
    this.calendarStreaming$.next(false);
    this.calendarStreamedCount$.next(0);
    this.calendarError$.next('');
    this.calendarEvents$.next([]);

    // Render empty skeleton grid immediately
    this.buildCalendarGrid(viewDate, []);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const startStr = `${year}-${pad(month + 1)}-01`;
    const endStr   = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

    this.outlookCalendarService.getCalendarEvents(startStr, endStr)
      .pipe(
        takeUntil(this.cancelCalendar$),
        takeUntil(this.destroy$),
        finalize(() => {
          this.calendarLoading$.next(false);
          this.calendarStreaming$.next(false);
        })
      )
      .subscribe({
        next: (response) => {
          // Support both { value: [...] } and a direct array
          const events: any[] = response?.value ?? (Array.isArray(response) ? response : []);

          // Switch to streaming mode and push events one by one
          this.calendarLoading$.next(false);
          this.calendarStreaming$.next(true);

          events.forEach((ev, i) => {
            const accumulated = [...this.calendarEvents$.getValue(), ev];
            this.calendarEvents$.next(accumulated);
            this.calendarStreamedCount$.next(i + 1);
            // Re-render grid after every appended event
            this.buildCalendarGrid(viewDate, accumulated);
          });

          this.calendarStreaming$.next(false);
          // Final sync for the selected-day detail panel
          this.refreshSelectedDay();
        },
        error: (err) => {
          this.calendarError$.next('Unable to load calendar. Please try again.');
          this.calendarLoading$.next(false);
          this.calendarStreaming$.next(false);
          console.error('Calendar load error:', err);
        }
      });
  }

  private refreshSelectedDay(): void {
    if (!this.selectedDate) return;
    const key = this.toDateKey(this.selectedDate);
    const allDays = this.calendarWeeks$.getValue().flat();
    const found = allDays.find(d => this.toDateKey(d.date) === key);
    if (found) this.selectedDateEvents$.next(found.events);
  }

  private buildCalendarGrid(viewDate: Date, rawEvents: any[]): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);

    // Map date-key → CalendarEvent[]
    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const ev of rawEvents) {
      const evStart = new Date(ev.start?.dateTime ?? ev.start);
      const key = this.toDateKey(evStart);
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key)!.push({
        subject: ev.subject ?? '(No title)',
        start: ev.start?.dateTime ?? ev.start ?? '',
        end:   ev.end?.dateTime   ?? ev.end   ?? ''
      });
    }

    const grid: CalendarDay[] = [];
    const startPad = firstDay.getDay();
    for (let i = startPad - 1; i >= 0; i--) {
      grid.push(this.makeDay(new Date(year, month, -i), false, today, eventsByDate));
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      grid.push(this.makeDay(new Date(year, month, d), true, today, eventsByDate));
    }
    const endPad = 6 - lastDay.getDay();
    for (let i = 1; i <= endPad; i++) {
      grid.push(this.makeDay(new Date(year, month + 1, i), false, today, eventsByDate));
    }

    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      weeks.push(grid.slice(i, i + 7));
    }
    this.calendarWeeks$.next(weeks);
  }

  private makeDay(
    date: Date,
    isCurrentMonth: boolean,
    today: Date,
    eventsByDate: Map<string, CalendarEvent[]>
  ): CalendarDay {
    const key    = this.toDateKey(date);
    const events = eventsByDate.get(key) ?? [];
    const isPast = date < today;
    const isToday = date.getTime() === today.getTime();
    const isBusy  = events.length > 0;

    return {
      date,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday,
      isFree: !isBusy && !isPast,
      isBusy,
      isSelected: this.selectedDate ? this.toDateKey(this.selectedDate) === key : false,
      isPast,
      events
    };
  }

  private toDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  selectDay(day: CalendarDay): void {
    this.selectedDate = day.date;
    this.selectedDateEvents$.next(day.events);
    this.buildCalendarGrid(this.calendarViewDate, this.calendarEvents$.getValue());
  }

  get selectedDateLabel(): string {
    if (!this.selectedDate) return '';
    return this.selectedDate.toLocaleDateString('en-IE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  formatEventTime(isoString: string): string {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('en-IE', {
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  get freeDaysCount$(): Observable<number> {
    return new Observable(observer => {
      this.calendarWeeks$.subscribe(weeks =>
        observer.next(weeks.flat().filter(d => d.isCurrentMonth && d.isFree).length)
      );
    });
  }

  get busyDaysCount$(): Observable<number> {
    return new Observable(observer => {
      this.calendarWeeks$.subscribe(weeks =>
        observer.next(weeks.flat().filter(d => d.isCurrentMonth && d.isBusy).length)
      );
    });
  }

  // ── Existing form methods (unchanged) ─────────────────────────────────────

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  isFieldVisible(field: FieldConfig): boolean {
    return field.visibleFor.includes(this.selectedProductModel);
  }

  getFieldValues(field: FieldConfig): string[] {
    if (field.values) return field.values;
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
    this.showForm = true;
    this.existingImageUrls = [...(siteVisit.imageUrls || [])];
    this.selectedImages = [];
    this.deletedImageUrls = [];

    const model = this.productModels.find(m => m.name === siteVisit.productModelType);
    if (model) {
      this.siteVisitForm.patchValue({ productModel: model.id }, { emitEvent: false });
      this.selectedProductModel = model.key;
      this.showFullTabs = model.key === 'awning' || model.key === 'roofSystem';
    }

    this.siteVisitForm.patchValue({
      model: siteVisit.model,
      customerId: this.customerId!,
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
    }, { emitEvent: false });
  }

  deleteSiteVisit(siteVisitId: number): void {
    if (confirm('Are you sure you want to delete this site visit?')) {
      this.siteVisitService.deleteSiteVisit(siteVisitId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.showSuccess('Site visit deleted successfully');
            this.workflowStateService.notifyWorkflowChanged();
            if (this.currentWorkflowId) this.loadSiteVisits(this.currentWorkflowId);
          },
          error: (error) => this.showError('Failed to delete site visit: ' + error.message)
        });
    }
  }

  onSubmit(): void {
    if (!this.currentWorkflowId) { this.showError('Please select a workflow'); return; }
    if (!this.siteVisitForm.get('productModel')?.value) { this.showError('Please select a product model'); return; }

    this.isSaving$.next(true);
    const formValue = this.siteVisitForm.value;
    const model = this.productModels.find(m => m.id === formValue.productModel);
    const productModelType = model ? model.name : '';

    if (this.editMode && this.editingSiteVisitId) {
      const updateDto: SiteVisitDto = {
        siteVisitId: this.editingSiteVisitId,
        workflowId: this.currentWorkflowId,
        productModelType,
        ...formValue,
        imageUrls: this.existingImageUrls
      };
      const editId = this.editingSiteVisitId;
      this.siteVisitService.updateSiteVisit(editId, updateDto)
        .pipe(
          switchMap(() => this.deletedImageUrls.length > 0 ? this.deleteRemovedImages(editId) : of(null)),
          switchMap(() => this.selectedImages.length > 0 ? this.uploadImages(editId) : of(null)),
          takeUntil(this.destroy$),
          finalize(() => this.isSaving$.next(false))
        )
        .subscribe({
          next: () => { this.showSuccess('Site visit updated successfully'); this.resetForm(); if (this.currentWorkflowId) this.loadSiteVisits(this.currentWorkflowId); },
          error: (error) => this.showError('Failed to update site visit: ' + error.message)
        });
    } else {
      const createDto: CreateSiteVisitDto = {
        workflowId: this.currentWorkflowId,
        customerId: this.customerId!,
        customerEmail: this.customerEmail || '',
        customerName: this.customerName || '',
        productModelType,
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
          switchMap((created: SiteVisitDto) =>
            this.selectedImages.length > 0 && created.siteVisitId
              ? this.uploadImages(created.siteVisitId)
              : of(null)
          ),
          takeUntil(this.destroy$),
          finalize(() => this.isSaving$.next(false))
        )
        .subscribe({
          next: () => { this.showSuccess('Site visit saved successfully'); this.workflowStateService.notifyStepCompleted('setup-site-visit'); this.resetForm(); if (this.currentWorkflowId) this.loadSiteVisits(this.currentWorkflowId); },
          error: (error) => this.showError('Failed to create site visit: ' + error.message)
        });
    }
  }

  resetForm(): void {
    this.editMode = false;
    this.editingSiteVisitId = null;
    this.showForm = false;
    const currentWorkflow = this.siteVisitForm.get('workflow')?.value;
    this.siteVisitForm.patchValue({ workflow: currentWorkflow, productModel: '', model: '', otherPleaseSpecify: '', siteLayout: '', structure: '', passageHeight: '', width: '', projection: '', heightAvailable: '', wallType: '', externalInsulation: '', wallFinish: '', wallThickness: '', specialBrackets: '', sideInfills: '', flashingRequired: '', flashingDimensions: '', standOfBrackets: '', standOfBracketDimension: '', electrician: '', electricalConnection: '', location: '', otherSiteSurveyNotes: '', fixtureType: '', operation: '', crankLength: '', operationSide: '', fabric: '', ral: '', valanceChoice: '', valance: '', windSensor: '', shadePlusRequired: '', shadeType: '', shadeplusFabric: '', shadePlusAnyOtherDetail: '', lights: '', lightsType: '', lightsAnyOtherDetails: '', heater: '', heaterManufacturer: '', numberRequired: '', heaterOutput: '', heaterColour: '', remoteControl: '', controllerBox: '', heaterAnyOtherDetails: '' }, { emitEvent: false });
    Object.keys(this.siteVisitForm.controls).forEach(key => { const control = this.siteVisitForm.get(key); control?.markAsUntouched(); control?.markAsPristine(); });
    this.selectedProductModel = '';
    this.showFullTabs = false;
    this.activeTab = 'product-model';
    this.selectedImages = [];
    this.existingImageUrls = [];
    this.deletedImageUrls = [];
  }

  addNewSiteVisit(): void {
    if (!this.currentWorkflowId) { this.showError('Please select a workflow first'); return; }
    const currentWorkflow = this.siteVisitForm.get('workflow')?.value;
    const currentProductModel = this.siteVisitForm.get('productModel')?.value;
    this.editMode = false;
    this.editingSiteVisitId = null;
    this.showForm = true;
    this.siteVisitForm.patchValue({ workflow: currentWorkflow, productModel: currentProductModel, model: '', otherPleaseSpecify: '', siteLayout: '', structure: '', passageHeight: '', width: '', projection: '', heightAvailable: '', wallType: '', externalInsulation: '', wallFinish: '', wallThickness: '', specialBrackets: '', sideInfills: '', flashingRequired: '', flashingDimensions: '', standOfBrackets: '', standOfBracketDimension: '', electrician: '', electricalConnection: '', location: '', otherSiteSurveyNotes: '', fixtureType: '', operation: '', crankLength: '', operationSide: '', fabric: '', ral: '', valanceChoice: '', valance: '', windSensor: '', shadePlusRequired: '', shadeType: '', shadeplusFabric: '', shadePlusAnyOtherDetail: '', lights: '', lightsType: '', lightsAnyOtherDetails: '', heater: '', heaterManufacturer: '', numberRequired: '', heaterOutput: '', heaterColour: '', remoteControl: '', controllerBox: '', heaterAnyOtherDetails: '' }, { emitEvent: false });
    Object.keys(this.siteVisitForm.controls).forEach(key => { if (key !== 'workflow' && key !== 'productModel') { const control = this.siteVisitForm.get(key); control?.markAsUntouched(); control?.markAsPristine(); } });
  }

  cancelForm(): void {
    this.resetForm();
  }

  private resetFormWithoutEvent(): void {
    this.editMode = false;
    this.editingSiteVisitId = null;
    this.showForm = false;
    this.siteVisitForm.patchValue({ productModel: '', model: '', otherPleaseSpecify: '', siteLayout: '', structure: '', passageHeight: '', width: '', projection: '', heightAvailable: '', wallType: '', externalInsulation: '', wallFinish: '', wallThickness: '', specialBrackets: '', sideInfills: '', flashingRequired: '', flashingDimensions: '', standOfBrackets: '', standOfBracketDimension: '', electrician: '', electricalConnection: '', location: '', otherSiteSurveyNotes: '', fixtureType: '', operation: '', crankLength: '', operationSide: '', fabric: '', ral: '', valanceChoice: '', valance: '', windSensor: '', shadePlusRequired: '', shadeType: '', shadeplusFabric: '', shadePlusAnyOtherDetail: '', lights: '', lightsType: '', lightsAnyOtherDetails: '', heater: '', heaterManufacturer: '', numberRequired: '', heaterOutput: '', heaterColour: '', remoteControl: '', controllerBox: '', heaterAnyOtherDetails: '' }, { emitEvent: false });
    this.selectedProductModel = '';
    this.showFullTabs = false;
    this.activeTab = 'product-model';
  }

  // ── Calendar event creation ────────────────────────────────────────────────

  openAddEventModal(day: CalendarDay): void {
    if (day.isPast && !day.isToday) return;
    this.selectDay(day);
    const dateKey = this.toDateKey(day.date);
    this.newEventForm = { subject: '', date: dateKey, startTime: '', endTime: '' };
    this.createEventError$.next('');
    this.createEventSuccess$.next('');
    this.buildModalTimeSlots(dateKey);
    this.showAddEventModal = true;
  }

  closeAddEventModal(): void {
    this.showAddEventModal = false;
  }

  submitNewEvent(): void {
    if (!this.newEventForm.subject.trim()) {
      this.createEventError$.next('Please enter a description.');
      return;
    }
    if (!this.newEventForm.startTime || !this.newEventForm.endTime) {
      this.createEventError$.next('Please select start and end times.');
      return;
    }

    const { date, startTime, endTime, subject } = this.newEventForm;
    const baseDate = this.parseDateKey(date);
    const startDateTime = this.parseTimeSlot(baseDate, startTime);
    const endDateTime   = this.parseTimeSlot(baseDate, endTime);

    const invite: ShowroomInvite = {
      workflowId:    this.currentWorkflowId || 0,
      customerId:    this.customerId || 0,
      customerEmail: this.customerEmail || '',
      customerName:  this.customerName || '',
      eventName:     subject,
      description:   subject,
      eventDate:     startDateTime,
      endDate:       endDateTime,
      timeSlot:      startTime,
      emailClient:   false
    };

    this.isCreatingEvent$.next(true);
    this.createEventError$.next('');

    this.outlookCalendarService.createShowroomInvite(invite)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isCreatingEvent$.next(false))
      )
      .subscribe({
        next: () => {
          this.createEventSuccess$.next('Event created successfully!');
          // Delay so Graph API has time to index the new event before re-fetching
          setTimeout(() => this.loadCalendarMonth(this.calendarViewDate), 800);
          setTimeout(() => {
            this.showAddEventModal = false;
            this.createEventSuccess$.next('');
          }, 2000);
        },
        error: () => {
          this.createEventError$.next('Failed to create event. Please try again.');
        }
      });
  }

  buildModalTimeSlots(dateStr: string): void {
    const baseDate = this.parseDateKey(dateStr);
    const events = this.selectedDateEvents$.getValue();

    this.modalStartSlots = this.modalTimeSlots.map(slot => {
      const slotTime = this.parseTimeSlot(baseDate, slot);
      const isBusy = events.some(ev => {
        const start = new Date(ev.start);
        const end   = new Date(ev.end);
        return slotTime >= start && slotTime < end;
      });
      return { slot, isBusy };
    });
    this.modalEndSlots = [];
  }

  onModalStartTimeChange(): void {
    const startSlot = this.newEventForm.startTime;
    this.newEventForm.endTime = '';
    if (!startSlot) { this.modalEndSlots = []; return; }

    const baseDate = this.parseDateKey(this.newEventForm.date);
    const events   = this.selectedDateEvents$.getValue();
    const startTime = this.parseTimeSlot(baseDate, startSlot);

    let nextEventStart: Date | null = null;
    events.forEach(ev => {
      const evStart = new Date(ev.start);
      if (evStart > startTime && (!nextEventStart || evStart < nextEventStart)) {
        nextEventStart = evStart;
      }
    });

    const startIndex = this.modalTimeSlots.indexOf(startSlot);
    this.modalEndSlots = this.modalTimeSlots.slice(startIndex + 1).map(slot => {
      const slotTime = this.parseTimeSlot(baseDate, slot);
      const isBusy = nextEventStart !== null && slotTime > nextEventStart;
      return { slot, isBusy };
    });
  }

  private parseDateKey(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private parseTimeSlot(eventDate: Date, timeSlot: string): Date {
    const [timePart, meridiem] = timeSlot.split(' ');
    const [hourStr, minStr] = timePart.split(':');
    let hour = parseInt(hourStr, 10);
    const min = parseInt(minStr, 10);
    if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;
    const local = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hour, min, 0);
    // Compensate for timezone offset: shifts the UTC value so the ISO string
    // reflects the local clock time (e.g. 09:00 BST → "...T09:00:00.000Z")
    return new Date(local.getTime() - local.getTimezoneOffset() * 60 * 1000);
  }

  // ── Image upload ───────────────────────────────────────────────────────────

  onImageSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      for (const file of Array.from(input.files)) {
        if (file.type.startsWith('image/')) this.selectedImages.push(file);
      }
      input.value = '';
    }
  }

  removeImage(index: number): void {
    this.selectedImages.splice(index, 1);
  }

  removeExistingImage(url: string): void {
    this.existingImageUrls = this.existingImageUrls.filter(u => u !== url);
    this.deletedImageUrls = [...this.deletedImageUrls, url];
  }

  getImageFilename(url: string): string {
    return url.split('/').pop() || url;
  }

  private uploadImages(siteVisitId: number): Observable<any> {
    const formData = new FormData();
    this.selectedImages.forEach(file => formData.append('files', file));
    return this.siteVisitService.uploadSiteVisitImages(siteVisitId, formData)
      .pipe(catchError(() => of(null)));
  }

  private deleteRemovedImages(siteVisitId: number): Observable<any> {
    return this.siteVisitService.deleteSiteVisitImages(siteVisitId, this.deletedImageUrls)
      .pipe(catchError(() => of(null)));
  }

  private showSuccess(message: string): void {
    this.notificationService.success(message);
    
  }

  private showError(message: string): void {
    this.notificationService.error(message);
    
  }
}