import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { AttendanceModule } from '../../modules/attendance/attendance.module.js';
import { NotificationsModule } from '../../modules/notifications/notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { AttendanceRemindersJob } from './attendance-reminders.job.js';
import { LowAttendanceDigestJob } from './low-attendance-digest.job.js';

/** DAVOMAT job oilasi (kechqurungi eslatma + haftalik past davomat). */
@Injectable()
export class AttendanceJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly reminders: AttendanceRemindersJob,
    private readonly lowDigest: LowAttendanceDigestJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.reminders, this.lowDigest);
  }
}

@Module({
  imports: [JobsModule, AttendanceModule, NotificationsModule],
  providers: [AttendanceRemindersJob, LowAttendanceDigestJob, AttendanceJobsRegistrar],
})
export class AttendanceJobsModule {}
