import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmailTaskComponent } from './email-task.component';


describe('EmailTaskComponent', () => {
  let component: EmailTaskComponent;
  let fixture: ComponentFixture<EmailTaskComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailTaskComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmailTaskComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
