import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { LibraryController } from './library/library.controller.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { StoriesController } from './stories/stories.controller.js';
import { StoriesService } from './stories/stories.service.js';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [HealthController, MeController, StoriesController, LibraryController],
  providers: [MeService, StoriesService],
})
export class AppModule {}
