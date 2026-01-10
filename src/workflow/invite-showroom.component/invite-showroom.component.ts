import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OutlookCalendarService, ShowroomInvite } from '../../service/outlook-calendar.service';
import { catchError, finalize, takeUntil, tap } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
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
export class InviteShowroomComponent {
  bookingForm: FormGroup;
  workflows: Workflow[] = [];
  private destroy$ = new Subject<void>();
  
  currentMonth: Date = new Date();
  selectedDate: Date | null = null;
  selectedStartTime: string = '';
  selectedEndTime: string = '';
  calendarDays: (number | null)[] = [];
  calendarEvents: CalendarEvent[] = [];
  eventsForSelectedDate: CalendarEvent[] = [];
  showEventsPopup: boolean = false;
  popupEvents: CalendarEvent[] = [];
  popupDate: Date | null = null;
  availableStartTimeSlots: string[] = [];
  availableEndTimeSlots: string[] = [];
  showDeleteConfirmation: boolean = false;
  eventToDelete: string | null = null;
  deletingEventName: string = '';
  
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
  
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  showEventsList: boolean = false;

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
  this.route.queryParams
    .pipe(takeUntil(this.destroy$))
    .subscribe(params => {
      // Extract parameters
      this.customerId = params['customerId'] ? parseInt(params['customerId']) : 1;
      this.customerName = params['customerName'] || 'Customer';
      this.customerEmail = params['customerEmail'] || 'customer@example.com';
      
      const paramWorkflowId = params['workflowId'] ? parseInt(params['workflowId']) : 0;
      let workflowId = paramWorkflowId;

      // Check workflow state service
      if (this.customerId) {
        const selectedWorkflow = this.workflowStateService.getSelectedWorkflow();
        if (selectedWorkflow) {
          this.customerId = selectedWorkflow.customerId || this.customerId;
          this.customerName = selectedWorkflow.customerName || this.customerName;
          workflowId = selectedWorkflow.id || workflowId;
        }
      }

      if (!this.customerId) {
        this.errorMessage = 'No customer selected. Please select a customer first.';
        return;
      }

      // ✅ LOAD WORKFLOWS FROM API
      this.loadWorkflowsForCustomer(workflowId);
    });

  this.generateCalendar();
  this.loadCalendarEvents();
}

  onWorkflowSelectionChange(): void {
  const selectedWorkflowId = parseInt(this.bookingForm.get('workflow')?.value);
  if (!selectedWorkflowId) return;

  this.workflowId = selectedWorkflowId;
  
  // ✅ FIND WORKFLOW AND UPDATE FORM
  const selectedWorkflow = this.workflows.find(w => parseInt(w.id) === selectedWorkflowId);
  if (selectedWorkflow) {
    this.bookingForm.patchValue({ 
      eventName: `${selectedWorkflow.name} - ${this.customerName}`,
      description: `Showroom visit for ${selectedWorkflow.name}`
    });
  }
  
  console.log('User selected workflow:', selectedWorkflow);
}

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}

  private onWorkflowChange(workflow: WorkflowDto): void {
  if (!workflow) return;

  const workflowName = workflow.productName || workflow.description || 'Showroom Visit';
  
  // ✅ AUTO-FILL FORM FIELDS
  this.bookingForm.patchValue({ 
    eventName: `${workflowName} - ${this.customerName}`,
    description: `Showroom visit for ${workflowName}`
  });
  
  console.log('Auto-selected Workflow:', {
    id: workflow.workflowId,
    name: workflowName,
    productName: workflow.productName
  });
}

private loadWorkflowsForCustomer(preselectedWorkflowId: number | null = null): void {
  if (!this.customerId) return;

  // Show loading spinner
  this.isLoading = true;
  
  // Call API to get workflows
  this.workflowService.getWorkflowsForCustomer(this.customerId)
    .pipe(
      takeUntil(this.destroy$),  // Auto-unsubscribe on destroy
      tap(workflows => {
        console.log('Loaded workflows:', workflows);
        
        // ✅ MAP API DATA TO DROPDOWN FORMAT 
        this.workflows = workflows.map(w => ({
          id: w.workflowId.toString(),
          name: w.productName || w.description || `Workflow ${w.workflowId}`
        }));
        
        console.log('Mapped workflows for dropdown:', this.workflows);
        
        // ✅ PRIORITY 1: Auto-select preselected workflow
        if (preselectedWorkflowId && workflows.some(w => w.workflowId === preselectedWorkflowId)) {
          this.workflowId = preselectedWorkflowId;
          this.bookingForm.patchValue({ workflow: this.workflowId.toString() });
          this.onWorkflowChange(workflows.find(w => w.workflowId === preselectedWorkflowId)!);
        }
        // ✅ PRIORITY 2: Auto-select if only one workflow
        else if (workflows.length === 1) {
          this.workflowId = workflows[0].workflowId;
          this.bookingForm.patchValue({ workflow: this.workflowId.toString() });
          this.onWorkflowChange(workflows[0]);
        }
      }),
      catchError(error => {
        console.error('Error loading workflows:', error);
        this.errorMessage = 'Failed to load workflows';
        this.workflows = []; // Reset on error
        return of([]);
      }),
      finalize(() => this.isLoading = false)  // ✅ ALWAYS HIDE LOADING
    )
    .subscribe();
}

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

    this.outlookService.getCalendarEvents(
      startDate.toISOString(),
      endDate.toISOString()
    ).subscribe({
      next: (response: any) => {
        this.calendarEvents = response.value || [];
        console.log('Loaded calendar events:', this.calendarEvents);
      },
      error: (error) => {
        console.error('Error loading calendar events:', error);
      }
    });
  }

  getEventsForDay(day: number | null): CalendarEvent[] {
    if (!day) return [];
    
    const dateToCheck = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      day
    );
    
    return this.calendarEvents.filter(event => {
      const eventDate = new Date(event.start.dateTime);
      return (
        eventDate.getDate() === dateToCheck.getDate() &&
        eventDate.getMonth() === dateToCheck.getMonth() &&
        eventDate.getFullYear() === dateToCheck.getFullYear()
      );
    });
  }

  hasEvents(day: number | null): boolean {
    return this.getEventsForDay(day).length > 0;
  }

  getEventCountForDay(day: number | null): number {
    return this.getEventsForDay(day).length;
  }

  getFirstEventForDay(day: number | null): CalendarEvent | null {
    const events = this.getEventsForDay(day);
    return events.length > 0 ? events[0] : null;
  }

  showMoreEvents(day: number | null, event: Event): void {
    event.stopPropagation();
    
    if (!day) return;
    
    this.popupDate = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      day
    );
    
    this.popupEvents = this.getEventsForDay(day);
    this.showEventsPopup = true;
  }

  closeEventsPopup(): void {
    this.showEventsPopup = false;
    this.popupEvents = [];
    this.popupDate = null;
  }

  previousMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() - 1,
      1
    );
    this.generateCalendar();
    this.loadCalendarEvents();
  }

  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
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

    const eventsForDay = this.getEventsForDay(this.selectedDate.getDate());

    this.availableStartTimeSlots = this.timeSlots.filter(timeSlot => {
      const slotTime = this.parseTimeSlot(this.selectedDate!, timeSlot);
      
      const isDuringEvent = eventsForDay.some(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        
        return slotTime >= eventStart && slotTime < eventEnd;
      });

      return !isDuringEvent;
    });
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

  isEndTimeAvailable(timeSlot: string): boolean {
    return this.availableEndTimeSlots.includes(timeSlot);
  }

  loadEventsForSelectedDate(): void {
    if (!this.selectedDate) {
      this.eventsForSelectedDate = [];
      return;
    }

    this.eventsForSelectedDate = this.calendarEvents.filter(event => {
      const eventDate = new Date(event.start.dateTime);
      return (
        eventDate.getDate() === this.selectedDate!.getDate() &&
        eventDate.getMonth() === this.selectedDate!.getMonth() &&
        eventDate.getFullYear() === this.selectedDate!.getFullYear()
      );
    });

    this.showEventsList = this.eventsForSelectedDate.length > 0;
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
    this.bookingForm.get('startTime')?.disable();
    this.bookingForm.get('endTime')?.disable();
    this.selectedDate = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.showEventsList = false;
    this.eventsForSelectedDate = [];
    this.availableStartTimeSlots = [];
    this.availableEndTimeSlots = [];
    this.selectedStartTime = '';
    this.selectedEndTime = '';
  }

  onSave(): void {
    if (this.bookingForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

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

      console.log('Creating showroom invite:', invite);

      this.outlookService.createShowroomInvite(invite).subscribe({
        next: (response) => {
          console.log('Showroom invite created:', response);
          const eventName = formData.eventName || 'Showroom Visit';
          this.successMessage = `Event "${eventName}" has been successfully created!`;
          this.isLoading = false;
          
          this.loadCalendarEvents();
          
          setTimeout(() => {
            this.onClose();
          }, 3000);
        },
        error: (error) => {
          console.error('Error creating showroom invite:', error);
          this.errorMessage = 'Failed to create showroom invitation. Please try again.';
          this.isLoading = false;
        }
      });
    } else {
      this.markFormGroupTouched(this.bookingForm);
      this.errorMessage = 'Please fill in all required fields.';
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

  deleteEvent(): void {
    if (!this.eventToDelete) return;

    const idToDelete = this.eventToDelete;
    const nameToDelete = this.deletingEventName;
    
    // Close confirmation dialog immediately
    this.showDeleteConfirmation = false;
    this.eventToDelete = null;
    this.deletingEventName = '';
    
    // Show loading
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.outlookService.deleteCalendarEvent(idToDelete)
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          this.successMessage = `Event "${nameToDelete}" has been successfully deleted!`;
          
          // Remove the event from all local arrays
          this.calendarEvents = this.calendarEvents.filter(e => e.id !== idToDelete);
          this.eventsForSelectedDate = this.eventsForSelectedDate.filter(e => e.id !== idToDelete);
          this.popupEvents = this.popupEvents.filter(e => e.id !== idToDelete);
          
          // Close popup if no more events
          if (this.popupEvents.length === 0) {
            this.closeEventsPopup();
          }
          
          this.showEventsList = this.eventsForSelectedDate.length > 0;
          
          if (this.selectedDate) {
            this.calculateAvailableStartTimeSlots();
            if (this.selectedStartTime) {
              this.onStartTimeChange();
            }
          }
          this.isLoading = false;
          setTimeout(() => {
            this.successMessage = '';
          }, 3000);
        }),
        catchError(error => {
          console.error('Error deleting event:', error);
          this.errorMessage = 'Failed to delete event. Please try again.';
          return of(null);
        }),
        finalize(() => this.isLoading = false)
      )
      .subscribe();
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

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}