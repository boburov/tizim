import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { StorageModule } from '../../modules/storage/storage.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { StorageCleanupJob } from './storage-cleanup.job.js';

/** SAQLAGICH job oilasi (avto-tozalash + boot tekislash). */
@Injectable()
export class StorageJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly cleanup: StorageCleanupJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.cleanup);
  }
}

@Module({
  imports: [JobsModule, StorageModule],
  providers: [StorageCleanupJob, StorageJobsRegistrar],
})
export class StorageJobsModule {}
