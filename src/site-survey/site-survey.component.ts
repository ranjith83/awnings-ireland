import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Observable, Subject, combineLatest } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { AppTaskSummaryDto, EmailTaskService } from '../service/email-task.service';
import { ScheduledShowroomInviteDto, SetupSiteVisitService } from '../service/setup-site-visit.service';
import { NavService } from '../service/nav.service';

type SiteSurveyTab = 'all' | 'scheduled' | 'completed';

/** Statuses considered "carried out" — matches AppTask.TaskStatusValue on the backend. */
const COMPLETED_STATUSES = ['Completed'];

/** Everything else — matches AppTask.TaskStatusValue on the backend, excluding Completed. */
const ACTIVE_STATUSES = ['New', 'In Progress', 'More Info', 'Reopened'];

interface SiteSurveyPage {
  totalCount: number;
  totalPages: number;
  completedItems: AppTaskSummaryDto[];
  scheduledItems: ScheduledShowroomInviteDto[];
}

@Component({
  selector: 'app-site-survey',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-survey.component.html',
  styleUrl: './site-survey.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SiteSurveyComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  readonly pageSize = 20;

  private tabSubject = new BehaviorSubject<SiteSurveyTab>('all');
  tab$ = this.tabSubject.asObservable();
  get tab(): SiteSurveyTab { return this.tabSubject.value; }

  private pageSubject = new BehaviorSubject<number>(1);
  page$ = this.pageSubject.asObservable();

  private refreshTrigger = new BehaviorSubject<void>(undefined);

  isLoading$ = new BehaviorSubject<boolean>(false);

  /**
   * "Site Surveys" reads active AppTasks (SourceType=SiteVisit, not yet completed);
   * "Completed" reads the same source filtered to Completed; "Scheduled" reads upcoming
   * ShowroomInvite bookings directly — that table is written atomically by
   * create-showroom-invite, so it's the source of truth for what's booked.
   */
  private response$: Observable<SiteSurveyPage> = combineLatest([
    this.tabSubject,
    this.pageSubject,
    this.refreshTrigger
  ]).pipe(
    tap(() => this.isLoading$.next(true)),
    switchMap(([tab, page]) => {
      if (tab === 'scheduled') {
        return this.siteVisitService.getScheduledSiteVisits(page, this.pageSize).pipe(
          map(r => ({
            totalCount: r.totalCount,
            totalPages: r.totalPages,
            completedItems: [] as AppTaskSummaryDto[],
            scheduledItems: r.items
          }))
        );
      }
      return this.emailTaskService.getTasksPaginated({
        sourceTypes: ['SiteVisit'],
        statuses: tab === 'completed' ? COMPLETED_STATUSES : ACTIVE_STATUSES,
        page,
        pageSize: this.pageSize,
        sortBy: 'DateAdded',
        sortDirection: 'DESC'
      }).pipe(
        map(r => ({
          totalCount: r.totalCount,
          totalPages: r.totalPages,
          completedItems: r.tasks,
          scheduledItems: [] as ScheduledShowroomInviteDto[]
        }))
      );
    }),
    tap(() => this.isLoading$.next(false))
  );

  items$ = this.response$.pipe(map(r => r.completedItems));
  scheduledItems$ = this.response$.pipe(map(r => r.scheduledItems));
  totalItems$ = this.response$.pipe(map(r => r.totalCount));
  totalPages$ = this.response$.pipe(map(r => r.totalPages));

  constructor(
    private emailTaskService: EmailTaskService,
    private siteVisitService: SetupSiteVisitService,
    private nav: NavService
  ) {}

  ngOnInit(): void {
    // Keep the sidebar badge in sync whenever this page is opened.
    this.siteVisitService.refreshPendingCount();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: SiteSurveyTab): void {
    if (this.tab === tab) return;
    this.tabSubject.next(tab);
    this.pageSubject.next(1);
  }

  nextPage(): void {
    this.pageSubject.next(this.pageSubject.value + 1);
  }

  prevPage(): void {
    if (this.pageSubject.value > 1) this.pageSubject.next(this.pageSubject.value - 1);
  }

  /** Navigates to the survey form — same deep-link used from the Task page today. */
  openSiteVisit(task: AppTaskSummaryDto): void {
    const queryParams: Record<string, any> = {
      customerId: task.customerId ?? null,
      customerName: task.customerName ?? '',
      workflowId: task.workflowId ?? null,
    };
    if (task.siteVisitId) queryParams['siteVisitId'] = task.siteVisitId;
    this.nav.go(['/workflow/setup-site-visit'], { queryParams });
  }

  /** Navigates to the survey form to carry out a booked-but-not-yet-visited invite. */
  openScheduledSiteVisit(invite: ScheduledShowroomInviteDto): void {
    this.nav.go(['/workflow/setup-site-visit'], {
      queryParams: {
        customerId: invite.customerId ?? null,
        customerName: invite.customerName ?? '',
        workflowId: invite.workflowId ?? null,
      }
    });
  }
}
