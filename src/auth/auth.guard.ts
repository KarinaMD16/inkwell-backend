import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { profiles, ROLES, type Role } from '../db/schema.js';
import { AuthService, type AuthUser } from './auth.service.js';

type AuthedRequest = Request & { user?: AuthUser };

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Cuánto puede un rol: sirve para comparar ("al menos moderador"). */
export const rank = (role: Role) => ROLES.indexOf(role);

/** Correos de ADMIN_EMAILS, en minúsculas. */
export function adminEmails(env: Env): Set<string> {
  return new Set(env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

const MIN_ROLE = 'inkwell:min-role';
/** La ruta pide al menos este rol. Va junto con AuthGuard. */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);

/**
 * Exige sesión: sin token válido responde 401. También carga el rol y si la cuenta está
 * suspendida: una cuenta suspendida solo puede leer, ver su perfil, descargar sus datos o borrarse.
 * Con @MinRole, además exige ese rol.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly admins: Set<string>;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DB) private readonly db: Db,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    this.admins = adminEmails(env);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    if (!token) throw new UnauthorizedException('Falta la sesión');
    const user = await this.auth.verify(token);

    const [row] = await this.db.select({ role: profiles.role, suspendedAt: profiles.suspendedAt }).from(profiles).where(eq(profiles.id, user.id));
    user.role = row?.role ?? 'lector';
    user.suspended = Boolean(row?.suspendedAt);
    // ADMIN_EMAILS manda: si el correo está ahí, la cuenta es admin aunque nadie se lo haya dado.
    if (row && user.role !== 'admin' && user.email && this.admins.has(user.email.toLowerCase())) {
      await this.db.update(profiles).set({ role: 'admin' }).where(eq(profiles.id, user.id));
      user.role = 'admin';
    }
    req.user = user;

    if (user.suspended && !this.allowedWhileSuspended(req)) {
      throw new ForbiddenException('Tu cuenta está suspendida: puedes leer, pero no escribir ni cambiar nada.');
    }
    const min = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE, [ctx.getHandler(), ctx.getClass()]);
    if (min && rank(user.role) < rank(min)) throw new ForbiddenException('No tienes permiso para esto');
    return true;
  }

  private allowedWhileSuspended(req: Request): boolean {
    if (req.method === 'GET') return true;
    // Borrar la cuenta propia es un derecho aunque esté suspendida.
    return req.method === 'DELETE' && req.path === '/me';
  }
}

/** La persona que hace la petición. Solo en rutas con AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException('Falta la sesión');
  return user;
});
