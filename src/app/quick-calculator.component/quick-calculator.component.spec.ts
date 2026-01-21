import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuickCalculatorComponent } from './quick-calculator.component';

describe('QuickCalculatorComponent', () => {
  let component: QuickCalculatorComponent;
  let fixture: ComponentFixture<QuickCalculatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickCalculatorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuickCalculatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
