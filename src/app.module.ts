import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { LibraryController } from './library/library.controller.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { ProfilesController } from './me/profiles.controller.js';
import { MyStoriesController } from './stories/my-stories.controller.js';
import { StoriesController } from './stories/stories.controller.js';
import { StoriesService } from './stories/stories.service.js';
import { TagsController } from './stories/tags.controller.js';
import { S3Storage, STORAGE } from './storage/storage.js';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [HealthController, MeController, ProfilesController, StoriesController, MyStoriesController, TagsController, LibraryController],
  providers: [MeService, StoriesService, { provide: STORAGE, useClass: S3Storage }],
})
export class AppModule {}
