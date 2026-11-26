import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { originChecker } from '../common/origins.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Db } from '../db/db.module.js';
import { profiles, ROLES, type Role } from '../db/schema.js';
import { maxRatingFor, type Viewer } from '../visibility/visibility.js';
import { AuthService, type AuthUser } from './auth.service.js';

type AuthedRequest = Request & { user?: AuthUser };

/** Cuánto puede un rol: sirve para comparar ("al menos moderador"). */
export const rank = (role: Role) => ROLES.indexOf(role);

/** Correos de ADMIN_EMAILS, en minúsculas. */
export function adminEmails(env: Env): Set<string> {
  return new Set(env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

const MIN_ROLE = 'inkwell:min-role';
/** La ruta pide al menos este rol. Va junto con AuthGuard. */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);

const OPTIONAL = 'inkwell:optional-auth';
/**
 * La ruta se puede usar sin sesión (lectura pública). Si llega una sesión, se usa para saber
 * quién lee y qué le toca ver; si llega vencida, responde 401 para que el cliente la renueve.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Lee una cookie sin dependencias: "a=1; ink_at=xyz" → "xyz". */
export function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * Exige sesión: sin token válido responde 401.
 * - La web manda la sesión en una cookie HttpOnly (el código de la página no puede leerla).
 * - La app nativa la manda en `Authorization: Bearer`.
 * Con cookie, una petición que cambia datos solo se acepta si viene de un origen de Inkwell:
 * así otro sitio no puede usar la sesión de alguien sin que lo sepa (CSRF).
 *
 * También carga el rol y si la cuenta está suspendida: una cuenta suspendida solo puede leer o
 * borrarse. Con @MinRole, además exige ese rol.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly fromInkwell: (origin: string | undefined) => boolean;
  private readonly admins: Set<string>;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DB) private readonly db: Db,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.fromInkwell = originChecker(env);
    this.admins = adminEmails(env);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    let token = bearer(req);
    if (!token) {
      token = cookie(req, this.env.AUTH_COOKIE);
      if (token && !SAFE_METHODS.has(req.method) && !this.fromInkwell(req.headers.origin)) {
        throw new ForbiddenException('Esta acción solo se puede hacer desde Inkwell.');
      }
    }
    if (!token) {
      if (this.reflector.getAllAndOverride<boolean | undefined>(OPTIONAL, [ctx.getHandler(), ctx.getClass()])) return true;
      throw new UnauthorizedException('Falta la sesión');
    }
    const user = await this.auth.verify(token);

    const [row] = await this.db
      .select({ role: profiles.role, suspendedAt: profiles.suspendedAt, birthdate: profiles.birthdate, showMature: profiles.showMature })
      .from(profiles).where(eq(profiles.id, user.id));
    user.role = row?.role ?? 'lector';
    user.suspended = Boolean(row?.suspendedAt);
    user.maxRating = maxRatingFor(row?.birthdate ?? null, row?.showMature ?? false);
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

/** Quien lee en una ruta con @OptionalAuth: null si no hay sesión. */
export const CurrentViewer = createParamDecorator((_: unknown, ctx: ExecutionContext): Viewer | null => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  return user ? { id: user.id, maxRating: user.maxRating } : null;
});

/** La persona que hace la petición. Solo en rutas con AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedException('Falta la sesión');
  return user;
});
