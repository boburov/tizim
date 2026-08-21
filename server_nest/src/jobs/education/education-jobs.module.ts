import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { GroupsModule } from '../../modules/groups/groups.module.js';
import { AssignmentsModule } from '../../modules/assignments/assignments.module.js';
import { HolidaysModule } from '../../modules/holidays/holidays.module.js';
import { StudentFreezeModule } from '../../modules/student-freeze/student-freeze.module.js';
import { NotificationsModule } from '../../modules/notifications/notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { AutoEndGroupsJob } from './auto-end-groups.job.js';
import { AssignmentDeliverJob } from './assignment-deliver.job.js';
import { LessonRemindersJob } from './lesson-reminders.job.js';

/**
 * TA'LIM job oilasi — 3 ta job (kurs arxivlash, vazifa yetkazish,
 * ertalabki dars eslatmasi).
 */
@Injectable()
export class EducationJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly autoEnd: AutoEndGroupsJob,
    private readonly deliver: AssignmentDeliverJob,
    private readonly reminders: LessonRemindersJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.autoEnd, this.deliver, this.reminders);
  }
}

@Module({
  imports: [
    JobsModule,
    GroupsModule,
    AssignmentsModule,
    HolidaysModule,
    StudentFreezeModule,
    NotificationsModule,
  ],
  providers: [
    AutoEndGroupsJob,
    AssignmentDeliverJob,
    LessonRemindersJob,
    EducationJobsRegistrar,
  ],
})
export class EducationJobsModule {}
