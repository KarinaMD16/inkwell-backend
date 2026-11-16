import { Module } from '@nestjs/common';
import { AdminController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { LibraryController } from './library/library.controller.js';
import { AccountsService } from './me/accounts.service.js';
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
  controllers: [HealthController, MeController, ProfilesController, StoriesController, MyStoriesController, TagsController, LibraryController, AdminController],
  providers: [MeService, StoriesService, AccountsService, AdminService, { provide: STORAGE, useClass: S3Storage }],
})
export class AppModule {}
