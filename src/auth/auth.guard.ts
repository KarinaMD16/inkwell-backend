import {
  CanActivate, createParamDecorator, ExecutionContext, Inject, Injectable, UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthUser } from './auth.service.js';

type AuthedRequest = Request & { user?: AuthUser };

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Exige sesión: sin token válido responde 401. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException('Falta la sesión');
    req.user = await this.auth.verify(token);
    return true;
  }
}

/** La persona que hace la petición. Solo en rutas con AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException('Falta la sesión');
  return user;
});
