import { Global, Module } from '@nestjs/common';
import { AUTH_DIRECTORY, SqlAuthDirectory } from './auth-directory.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ACCOUNT_ADMIN, SupabaseAccountAdmin } from './auth-admin.js';

@Global()
@Module({
  providers: [
    AuthService, AuthGuard,
    { provide: ACCOUNT_ADMIN, useClass: SupabaseAccountAdmin },
    { provide: AUTH_DIRECTORY, useClass: SqlAuthDirectory },
  ],
  exports: [AuthService, AuthGuard, ACCOUNT_ADMIN, AUTH_DIRECTORY],
})
export class AuthModule {}
