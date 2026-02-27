import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OutlookCalendarService, ShowroomInvite } from '../../service/outlook-calendar.service';
import { catchError, finalize, takeUntil, tap, take } from 'rxjs/operators';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { WorkflowDto, WorkflowService } from '../../service/workflow.service';
import { WorkflowStateService } from '../../service/workflow-state.service';

interface Workflow {
  id: string;
  name: string;
}

interface CalendarEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
}

@Component({
  selector: 'app-invite-showroom',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './invite-showroom.component.html',
  styleUrl: './invite-showroom.component.scss'
})
export class InviteShowroomComponent implements OnInit, OnDestroy {
  bookingForm: FormGroup;
  
  // ✅ Convert to BehaviorSubjects for reactive state management
  private workflowsSubject$ = new BehaviorSubject<Workflow[]>([]);
  private calendarEventsSubject$ = new BehaviorSubject<CalendarEvent[]>([]);
  private eventsForSelectedDateSubject$ = new BehaviorSubject<CalendarEvent[]>([]);
  private popupEventsSubject$ = new BehaviorSubject<CalendarEvent[]>([]);
  private isLoadingSubject$ = new BehaviorSubject<boolean>(false);
  private errorMessageSubject$ = new BehaviorSubject<string>('');
  private successMessageSubject$ = new BehaviorSubject<string>('');
  private deletingEventIdSubject$ = new BehaviorSubject<string | null>(null);
  
  // ✅ Public observables for template
  workflows$: Observable<Workflow[]> = this.workflowsSubject$.asObservable();
  calendarEvents$: Observable<CalendarEvent[]> = this.calendarEventsSubject$.asObservable();
  eventsForSelectedDate$: Observable<CalendarEvent[]> = this.eventsForSelectedDateSubject$.asObservable();
  popupEvents$: Observable<CalendarEvent[]> = this.popupEventsSubject$.asObservable();
  isLoading$: Observable<boolean> = this.isLoadingSubject$.asObservable();
  errorMessage$: Observable<string> = this.errorMessageSubject$.asObservable();
  successMessage$: Observable<string> = this.successMessageSubject$.asObservable();
  deletingEventId$: Observable<string | null> = this.deletingEventIdSubject$.asObservable();
  
  private destroy$ = new Subject<void>();
  
  currentMonth: Date = new Date();
  selectedDate: Date | null = null;
  selectedStartTime: string = '';
  selectedEndTime: string = '';
  calendarDays: (number | null)[] = [];
  availableStartTimeSlots: string[] = [];
  availableEndTimeSlots: string[] = [];
  showEventsPopup: boolean = false;
  popupDate: Date | null = null;
  showDeleteConfirmation: boolean = false;
  eventToDelete: string | null = null;
  deletingEventName: string = '';
  showEventsList: boolean = false;
  
  // Customer data from route params
  customerId: number = 1;
  customerName: string = '';
  customerEmail: string = '';
  workflowId: number = 0;
  
  timeSlots: string[] = [
    '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
    '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
    '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM'
  ];

  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  constructor(
    private fb: FormBuilder,
    private outlookService: OutlookCalendarService,
    private route: ActivatedRoute,
    private workflowStateService: WorkflowStateService,
    private workflowService: WorkflowService,
  ) {
    this.bookingForm = this.fb.group({
      workflow: ['', Validators.required],
      eventName: ['', Validators.required],
      description: [''],
      eventDate: [null, Validators.required],
      startTime: [{ value: '', disabled: true }, Validators.required],
      endTime: [{ value: '', disabled: true }, Validators.required],
      emailClient: [false]
    });
  }

  ngOnInit(): void {
    // Subscribe to calendar events changes and force the calendar grid to
    // re-render. getEventsForDay() is a plain method called synchronously
    // in the template — Angular won't re-evaluate it when the BehaviorSubject
    // updates unless a template-bound property changes. Re-assigning calendarDays
    // via spread triggers change detection across every calendar cell.
    this.calendarEvents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(events => {
        console.log('📊 Calendar events updated in component:', events.length, 'events');
        this.calendarDays = [...this.calendarDays];
        if (this.selectedDate) {
          this.loadEventsForSelectedDate();
        }
      });
    
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.customerId = params['customerId'] ? parseInt(params['customerId']) : 1;
        this.customerName = params['customerName'] || 'Customer';
        this.customerEmail = params['customerEmail'] || 'customer@example.com';
        
        const paramWorkflowId = params['workflowId'] ? parseInt(params['workflowId']) : 0;
        let workflowId = paramWorkflowId;

        if (this.customerId) {
          const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
          if (selectedWorkflow) {
            this.customerId = selectedWorkflow.customerId || this.customerId;
            this.customerName = selectedWorkflow.customerName || this.customerName;
            workflowId = selectedWorkflow.id || workflowId;
          }
        }

        if (!this.customerId) {
          this.errorMessageSubject$.next('No customer selected. Please select a customer first.');
          return;
        }

        this.loadWorkflowsForCustomer(workflowId);
      });

    // ✅ Generate calendar first
    this.generateCalendar();
    
    // ✅ Then load events with a slight delay to ensure calendar is rendered
    setTimeout(() => {
      this.loadCalendarEvents();
    }, 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null): void {
    if (!this.customerId) return;

    this.isLoadingSubject$.next(true);
    
    this.workflowService.getWorkflowsForCustomer(this.customerId)
      .pipe(
        take(1), // ✅ Complete after first emission
        takeUntil(this.destroy$),
        tap(workflows => {
          const mappedWorkflows = workflows.map(w => ({
            id: w.workflowId.toString(),
            name: w.productName || w.description || `Workflow ${w.workflowId}`
          }));
          
          this.workflowsSubject$.next(mappedWorkflows);
          
          if (preselectedWorkflowId && workflows.some(w => w.workflowId === preselectedWorkflowId)) {
            this.workflowId = preselectedWorkflowId;
            this.bookingForm.patchValue({ workflow: this.workflowId.toString() });
            this.onWorkflowChange(workflows.find(w => w.workflowId === preselectedWorkflowId)!);
          } else if (workflows.length === 1) {
            this.workflowId = workflows[0].workflowId;
            this.bookingForm.patchValue({ workflow: this.workflowId.toString() });
            this.onWorkflowChange(workflows[0]);
          }
        }),
        catchError(error => {
          console.error('Error loading workflows:', error);
          this.errorMessageSubject$.next('Failed to load workflows');
          return of([]);
        }),
        finalize(() => this.isLoadingSubject$.next(false))
      )
      .subscribe();
  }

  loadCalendarEvents(): void {
    const startDate = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      1
    );
    const endDate = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      0
    );

    console.log('🔄 Loading calendar events from', startDate.toLocaleDateString(), 'to', endDate.toLocaleDateString());

    this.outlookService.getCalendarEvents(
      startDate.toISOString(),
      endDate.toISOString()
    )
    .pipe(
      take(1), // ✅ Complete after first emission
      takeUntil(this.destroy$),
      tap((response: any) => {
        const events = response.value || [];
        console.log('✅ Loaded calendar events:', events.length, 'events');
        console.log('Events:', events);
        
        // ✅ Update the BehaviorSubject with new events
        this.calendarEventsSubject$.next(events);
        
        // ✅ If a date is selected, refresh its events too
        if (this.selectedDate) {
          this.loadEventsForSelectedDate();
        }
      }),
      catchError(error => {
        console.error('❌ Error loading calendar events:', error);
        this.errorMessageSubject$.next('Failed to load calendar events');
        return of({ value: [] });
      })
    )
    .subscribe();
  }

  // ✅ ASYNC DELETE METHOD - Guaranteed cleanup
  async deleteEventAsync(): Promise<void> {
    if (!this.eventToDelete) return;

    const idToDelete = this.eventToDelete;
    const nameToDelete = this.deletingEventName;
    
    // Close confirmation dialog
    this.showDeleteConfirmation = false;
    this.eventToDelete = null;
    this.deletingEventName = '';
    
    // Set loading states
    this.deletingEventIdSubject$.next(idToDelete);
    this.isLoadingSubject$.next(true);
    this.errorMessageSubject$.next('');
    this.successMessageSubject$.next('');

    try {
      console.log('🗑️ Starting delete operation for:', idToDelete);
      
      await this.outlookService.deleteCalendarEvent(idToDelete)
        .pipe(
          take(1),
          takeUntil(this.destroy$)
        )
        .toPromise();
      
      console.log('✅ Delete successful');
      
      // Close popup immediately
      this.closeEventsPopup();
      
      // Show success message
      this.successMessageSubject$.next(`Event "${nameToDelete}" has been successfully deleted!`);
      
      // Refresh calendar from server
      this.loadCalendarEvents();
      
      // Update selected date
      if (this.selectedDate) {
        this.loadEventsForSelectedDate();
        this.calculateAvailableStartTimeSlots();
        if (this.selectedStartTime) {
          this.onStartTimeChange();
        }
      }
      
      // Auto-clear success message
      setTimeout(() => {
        this.successMessageSubject$.next('');
      }, 3000);
      
    } catch (error) {
      console.error('❌ Error deleting event:', error);
      this.errorMessageSubject$.next('Failed to delete event. Please try again.');
      
      setTimeout(() => {
        this.errorMessageSubject$.next('');
      }, 5000);
      
    } finally {
      // ✅ ALWAYS executes - guaranteed cleanup
      this.isLoadingSubject$.next(false);
      this.deletingEventIdSubject$.next(null);
      console.log('✅ finally() executed - all loading states cleared');
    }
  }

  confirmDeleteEvent(eventId: string, eventName: string): void {
    this.eventToDelete = eventId;
    this.deletingEventName = eventName;
    this.showDeleteConfirmation = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.eventToDelete = null;
    this.deletingEventName = '';
  }

  isDeletingEvent(eventId: string): boolean {
    return this.deletingEventIdSubject$.value === eventId;
  }

  closeEventsPopup(): void {
    this.showEventsPopup = false;
    this.popupEventsSubject$.next([]);
    this.popupDate = null;
  }

  onWorkflowSelectionChange(): void {
    const selectedWorkflowId = parseInt(this.bookingForm.get('workflow')?.value);
    if (!selectedWorkflowId) return;

    this.workflowId = selectedWorkflowId;
    
    const selectedWorkflow = this.workflowsSubject$.value.find(w => parseInt(w.id) === selectedWorkflowId);
    if (selectedWorkflow) {
      this.bookingForm.patchValue({ 
        eventName: `${selectedWorkflow.name} - ${this.customerName}`,
        description: `Showroom visit for ${selectedWorkflow.name}`
      });
    }
  }

  private onWorkflowChange(workflow: WorkflowDto): void {
    if (!workflow) return;

    const workflowName = workflow.productName || workflow.description || 'Showroom Visit';
    
    this.bookingForm.patchValue({ 
      eventName: `${workflowName} - ${this.customerName}`,
      description: `Showroom visit for ${workflowName}`
    });
  }

  // ✅ These methods need to access the current value synchronously for template
  getEventsForDay(day: number | null): CalendarEvent[] {
    if (!day) return [];
    
    const dateToCheck = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      day
    );
    
    // ✅ Use .value to get current state synchronously
    const allEvents = this.calendarEventsSubject$.value;
    
    return allEvents.filter(event => {
      const eventDate = new Date(event.start.dateTime);
      return (
        eventDate.getDate() === dateToCheck.getDate() &&
        eventDate.getMonth() === dateToCheck.getMonth() &&
        eventDate.getFullYear() === dateToCheck.getFullYear()
      );
    });
  }

  hasEvents(day: number | null): boolean {
    if (!day) return false;
    return this.getEventsForDay(day).length > 0;
  }

  getEventCountForDay(day: number | null): number {
    if (!day) return 0;
    return this.getEventsForDay(day).length;
  }

  getFirstEventForDay(day: number | null): CalendarEvent | null {
    if (!day) return null;
    const events = this.getEventsForDay(day);
    return events.length > 0 ? events[0] : null;
  }

  loadEventsForSelectedDate(): void {
    if (!this.selectedDate) {
      this.eventsForSelectedDateSubject$.next([]);
      this.showEventsList = false;
      return;
    }

    console.log('📅 Loading events for selected date:', this.selectedDate.toLocaleDateString());
    
    // ✅ Filter from current calendar events
    const allEvents = this.calendarEventsSubject$.value;
    
    const events = allEvents.filter(event => {
      const eventDate = new Date(event.start.dateTime);
      const matches = (
        eventDate.getDate() === this.selectedDate!.getDate() &&
        eventDate.getMonth() === this.selectedDate!.getMonth() &&
        eventDate.getFullYear() === this.selectedDate!.getFullYear()
      );
      return matches;
    });

    console.log('✅ Found', events.length, 'events for selected date');
    
    this.eventsForSelectedDateSubject$.next(events);
    this.showEventsList = events.length > 0;
  }

  // ... Rest of your existing methods (generateCalendar, selectDate, etc.)
  // Keep all the calendar navigation and time slot logic as-is
  
  generateCalendar(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    this.calendarDays = [];
    
    for (let i = 0; i < firstDay; i++) {
      this.calendarDays.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      this.calendarDays.push(day);
    }
  }

  previousMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    console.log('⬅️ Navigate to previous month:', this.currentMonth.toLocaleDateString());
    this.generateCalendar();
    this.loadCalendarEvents();
  }

  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    console.log('➡️ Navigate to next month:', this.currentMonth.toLocaleDateString());
    this.generateCalendar();
    this.loadCalendarEvents();
  }

  selectDate(day: number | null): void {
    if (day === null) return;
    
    this.selectedDate = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      day
    );
    this.bookingForm.patchValue({ eventDate: this.selectedDate });
    
    this.bookingForm.get('startTime')?.enable();
    this.bookingForm.get('endTime')?.enable();
    
    this.calculateAvailableStartTimeSlots();
    this.loadEventsForSelectedDate();
  }

  calculateAvailableStartTimeSlots(): void {
    if (!this.selectedDate) {
      this.availableStartTimeSlots = [];
      return;
    }

    console.log('⏰ Calculating available time slots for:', this.selectedDate.toLocaleDateString());
    
    const eventsForDay = this.getEventsForDay(this.selectedDate.getDate());
    console.log('Events on this day:', eventsForDay.length);

    this.availableStartTimeSlots = this.timeSlots.filter(timeSlot => {
      const slotTime = this.parseTimeSlot(this.selectedDate!, timeSlot);
      
      const isDuringEvent = eventsForDay.some(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        
        return slotTime >= eventStart && slotTime < eventEnd;
      });

      return !isDuringEvent;
    });
    
    console.log('Available start time slots:', this.availableStartTimeSlots.length);
  }

  onStartTimeChange(): void {
    this.selectedStartTime = this.bookingForm.get('startTime')?.value;
    
    if (!this.selectedStartTime || !this.selectedDate) {
      this.availableEndTimeSlots = [];
      return;
    }

    const startTime = this.parseTimeSlot(this.selectedDate, this.selectedStartTime);
    const eventsForDay = this.getEventsForDay(this.selectedDate.getDate());

    let nextEventStart: Date | null = null;
    eventsForDay.forEach(event => {
      const eventStart = new Date(event.start.dateTime);
      if (eventStart > startTime) {
        if (!nextEventStart || eventStart < nextEventStart) {
          nextEventStart = eventStart;
        }
      }
    });

    const startIndex = this.timeSlots.indexOf(this.selectedStartTime);
    this.availableEndTimeSlots = this.timeSlots.slice(startIndex + 1).filter(timeSlot => {
      const slotTime = this.parseTimeSlot(this.selectedDate!, timeSlot);
      
      if (nextEventStart && slotTime > nextEventStart) {
        return false;
      }

      return true;
    });

    if (this.selectedEndTime && !this.availableEndTimeSlots.includes(this.selectedEndTime)) {
      this.selectedEndTime = '';
      this.bookingForm.patchValue({ endTime: '' });
    }
  }

  onEndTimeChange(): void {
    this.selectedEndTime = this.bookingForm.get('endTime')?.value;
  }

  isStartTimeAvailable(timeSlot: string): boolean {
    return this.availableStartTimeSlots.includes(timeSlot);
  }

  isSelectedDate(day: number | null): boolean {
    if (!day || !this.selectedDate) return false;
    
    return (
      day === this.selectedDate.getDate() &&
      this.currentMonth.getMonth() === this.selectedDate.getMonth() &&
      this.currentMonth.getFullYear() === this.selectedDate.getFullYear()
    );
  }

  getMonthYear(): string {
    return this.currentMonth.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  }

  parseTimeSlot(eventDate: Date, timeSlot: string): Date {
    const timeParts = timeSlot.split(' ');
    const time = timeParts[0].split(':');
    let hour = parseInt(time[0]);
    const minute = parseInt(time[1]);
    const isPM = timeParts[1].toUpperCase() === 'PM';

    if (isPM && hour !== 12) {
      hour += 12;
    } else if (!isPM && hour === 12) {
      hour = 0;
    }

    return new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      hour,
      minute,
      0
    );
  }

  showMoreEvents(day: number | null, event: Event): void {
    event.stopPropagation();
    
    if (!day) return;
    
    this.popupDate = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      day
    );
    
    this.popupEventsSubject$.next(this.getEventsForDay(day));
    this.showEventsPopup = true;
  }

  formatEventTime(dateTime: string): string {
    const date = new Date(dateTime);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }

  toggleEventsList(): void {
    this.showEventsList = !this.showEventsList;
  }

  onClose(): void {
    this.bookingForm.reset({
      workflow: this.workflowId ? this.workflowId.toString() : '',
      eventName: '',
      description: '',
      eventDate: null,
      startTime: '',
      endTime: '',
      emailClient: false
    });
    // Mark the entire form as pristine and untouched so no field appears
    // invalid after reset — without this, previously-touched fields keep their
    // invalid state and the save button stays disabled for the next booking.
    this.bookingForm.markAsPristine();
    this.bookingForm.markAsUntouched();
    this.bookingForm.updateValueAndValidity();

    this.bookingForm.get('startTime')?.disable();
    this.bookingForm.get('endTime')?.disable();
    this.selectedDate = null;
    this.errorMessageSubject$.next('');
    this.successMessageSubject$.next('');
    this.showEventsList = false;
    this.eventsForSelectedDateSubject$.next([]);
    this.availableStartTimeSlots = [];
    this.availableEndTimeSlots = [];
    this.selectedStartTime = '';
    this.selectedEndTime = '';
  }

  onSave(): void {
    if (this.bookingForm.valid) {
      this.isLoadingSubject$.next(true);
      this.errorMessageSubject$.next('');
      this.successMessageSubject$.next('');

      const formData = this.bookingForm.value;
      
      const startDateTime = this.parseTimeSlot(this.selectedDate!, formData.startTime);
      const endDateTime = this.parseTimeSlot(this.selectedDate!, formData.endTime);
      
      const invite: ShowroomInvite = {
        workflowId: parseInt(formData.workflow),
        customerId: this.customerId,
        customerEmail: this.customerEmail,
        customerName: this.customerName,
        eventName: formData.eventName,
        description: formData.description,
        eventDate: startDateTime,
        endDate: endDateTime,
        timeSlot: formData.startTime,
        emailClient: formData.emailClient
      };

      this.outlookService.createShowroomInvite(invite)
        .pipe(
          take(1),
          takeUntil(this.destroy$),
          tap(response => {
            const eventName = formData.eventName || 'Showroom Visit';
            this.successMessageSubject$.next(`Event "${eventName}" has been successfully created!`);

            // Delay the calendar refresh slightly so Graph has time to index
            // the new event before we fetch the CalendarView.
            setTimeout(() => this.loadCalendarEvents(), 800);

            // Keep isLoading = true until onClose() fires so the Save button
            // stays disabled during the success-message window. The form is
            // fully reset (markAsPristine/Untouched) inside onClose(), ensuring
            // the next booking starts with a clean, enabled Save button.
            setTimeout(() => {
              this.isLoadingSubject$.next(false);
              this.onClose();
            }, 3000);
          }),
          catchError(error => {
            console.error('Error creating showroom invite:', error);
            this.errorMessageSubject$.next('Failed to create showroom invitation. Please try again.');
            this.isLoadingSubject$.next(false);
            return of(null);
          })
          // Note: finalize() removed — loading state is now managed explicitly
          // above so it stays true until the form reset timeout completes.
        )
        .subscribe();
    } else {
      this.markFormGroupTouched(this.bookingForm);
      this.errorMessageSubject$.next('Please fill in all required fields.');
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  // ✅ TrackBy function to help Angular track changes
  trackByIndex(index: number, item: any): number {
    return index;
  }
}