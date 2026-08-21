import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { NotificationsModule } from '../../modules/notifications/notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { NotificationDeliverJob } from './notification-deliver.job.js';
import { NotificationSendJob } from './notification-send.job.js';

/**
 * BILDIRISHNOMA job oilasi.
 *
 * ⚠ ALOHIDA MODUL — halqani (circular dependency) oldini olish uchun:
 * `NotificationsModule` `SchedulerService` uchun `JobsModule` ni import
 * qiladi, joblar esa `NotificationsService` ga tayanadi. Ikkalasi bitta
 * modulda bo'lsa `JobsModule ⇄ NotificationsModule` halqasi bo'lardi.
 *
 * Joblar `onModuleInit` da o'zini `JobsRegistry` ga yozadi — u
 * `onApplicationBootstrap` dan OLDIN ishlaydi, ya'ni ishchilar
 * ko'tarilganda ro'yxat to'liq bo'ladi.
 */
@Injectable()
export class NotificationJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly deliver: NotificationDeliverJob,
    private readonly send: NotificationSendJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.deliver, this.send);
  }
}

@Module({
  imports: [JobsModule, NotificationsModule],
  providers: [NotificationDeliverJob, NotificationSendJob, NotificationJobsRegistrar],
})
export class NotificationJobsModule {}
