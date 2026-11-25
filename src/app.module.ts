import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ErrorsFilter } from './common/errors.filter.js';
import { ENV, type Env } from './config/env.js';
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
  imports: [
    DbModule,
    AuthModule,
    // Límite de peticiones por IP (regla 8). Vive en la memoria de cada proceso: con varias
    // instancias, cada una cuenta por su lado. Si crece, se pasa a Redis sin tocar los controladores.
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }],
        // Las pruebas automáticas hacen cientos de peticiones seguidas desde la misma IP.
        skipIf: () => process.env.NODE_ENV === 'test',
      }),
    }),
  ],
  controllers: [HealthController, MeController, ProfilesController, StoriesController, MyStoriesController, TagsController, LibraryController, AdminController],
  providers: [
    MeService,
    StoriesService,
    AccountsService,
    AdminService,
    { provide: STORAGE, useClass: S3Storage },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ErrorsFilter },
  ],
})
export class AppModule {}
