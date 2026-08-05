import { Module } from '@nestjs/common';
import { GithubService } from './github.service.js';
import { GithubController } from './github.controller.js';

@Module({
  controllers: [GithubController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
