import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';


interface Workflow {
  id: string;
  name: string;
}

@Component({
  selector: 'app-invite-showroom.component',
  imports: [    ReactiveFormsModule,   CommonModule],
  templateUrl: './invite-showroom.component.html',
  styleUrl: './invite-showroom.component.scss'
})
export class InviteShowroomComponent {

 bookingForm: FormGroup;
  workflows: Workflow[] = [
    { id: '1', name: 'Markilux 990' },
    { id: '2', name: 'Markilux 1600' },
    { id: '3', name: 'Markilux 3300' }
  ];
  
  currentMonth: Date = new Date(2025, 9, 1); // October 2025
  selectedDate: Date | null = null;
  selectedTime: string = '08:00 AM';
  calendarDays: (number | null)[] = [];
  
  timeSlots: string[] = [
    '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
    '04:00 PM', '05:00 PM', '06:00 PM'
  ];

  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  constructor(private fb: FormBuilder) {
    this.bookingForm = this.fb.group({
      workflow: ['', Validators.required],
      description: [''],
      eventDate: [null, Validators.required],
      timeSlot: ['08:00 AM', Validators.required],
      emailClient: [false]
    });
  }

  ngOnInit(): void {
    this.generateCalendar();
  }

  generateCalendar(): void {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    this.calendarDays = [];
    
    // Add empty slots for days before month starts
    for (let i = 0; i < firstDay; i++) {
      this.calendarDays.push(null);
    }
    
    // Add days of the month
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
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentMonth = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      1
    );
    this.generateCalendar();
  }

  selectDate(day: number | null): void {
    if (day === null) return;
    
    this.selectedDate = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      day
    );
    this.bookingForm.patchValue({ eventDate: this.selectedDate });
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

  onTimeSlotChange(time: string): void {
    this.selectedTime = time;
    this.bookingForm.patchValue({ timeSlot: time });
  }

  onClose(): void {
    this.bookingForm.reset();
    this.selectedDate = null;
  }

  onSave(): void {
    if (this.bookingForm.valid) {
      const formData = {
        ...this.bookingForm.value,
        eventDate: this.selectedDate?.toISOString()
      };
      console.log('Booking saved:', formData);
      // Implement your save logic here (API call, etc.)
    } else {
      this.markFormGroupTouched(this.bookingForm);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}
