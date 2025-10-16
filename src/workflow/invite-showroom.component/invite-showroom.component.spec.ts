import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InviteShowroomComponent } from './invite-showroom.component';

describe('InviteShowroomComponent', () => {
  let component: InviteShowroomComponent;
  let fixture: ComponentFixture<InviteShowroomComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InviteShowroomComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InviteShowroomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
