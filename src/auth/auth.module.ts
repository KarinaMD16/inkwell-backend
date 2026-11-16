import { Global, Module } from '@nestjs/common';
import { AUTH_DIRECTORY, SqlAuthDirectory } from './auth-directory.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  providers: [AuthService, AuthGuard, { provide: AUTH_DIRECTORY, useClass: SqlAuthDirectory }],
  exports: [AuthService, AuthGuard, AUTH_DIRECTORY],
})
export class AuthModule {}
