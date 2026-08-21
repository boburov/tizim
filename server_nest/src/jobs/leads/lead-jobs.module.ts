import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { LeadsModule } from '../../modules/leads/leads.module.js';
import { SystemNotificationsModule } from '../../modules/system-notifications/system-notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { LeadFollowupRemindersJob, LeadDailyDigestJob } from './lead-jobs.js';

/** LID job oilasi — eslatma (har 5 daqiqada) + kunlik yig'ma (09:00). */
@Injectable()
export class LeadJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly followup: LeadFollowupRemindersJob,
    private readonly digest: LeadDailyDigestJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.followup, this.digest);
  }
}

@Module({
  imports: [JobsModule, LeadsModule, SystemNotificationsModule],
  providers: [LeadFollowupRemindersJob, LeadDailyDigestJob, LeadJobsRegistrar],
})
export class LeadJobsModule {}
