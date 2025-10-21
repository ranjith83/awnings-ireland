import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InitialEnquiryComponent } from './initial-enquiry.component';

describe('InitialEnquiryComponent', () => {
  let component: InitialEnquiryComponent;
  let fixture: ComponentFixture<InitialEnquiryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InitialEnquiryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InitialEnquiryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
