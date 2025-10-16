import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SetupSiteVisitComponent } from './setup-site-visit.component';

describe('SetupSiteVisitComponent', () => {
  let component: SetupSiteVisitComponent;
  let fixture: ComponentFixture<SetupSiteVisitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupSiteVisitComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SetupSiteVisitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
