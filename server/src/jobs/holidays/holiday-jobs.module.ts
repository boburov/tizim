import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { HolidaysModule } from '../../modules/holidays/holidays.module.js';
import { NotificationsModule } from '../../modules/notifications/notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { HolidayGreetingsJob } from './holiday-greetings.job.js';

/**
 * BAYRAM job oilasi.
 *
 * ⚠ Halqa YO'Q: `HolidaysModule` ham, `NotificationsModule` ham bu
 * modulni bilmaydi. Job o'zini `onModuleInit` da ro'yxatga oladi.
 */
@Injectable()
export class HolidayJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly greetings: HolidayGreetingsJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.greetings);
  }
}

@Module({
  imports: [JobsModule, HolidaysModule, NotificationsModule],
  providers: [HolidayGreetingsJob, HolidayJobsRegistrar],
})
export class HolidayJobsModule {}
