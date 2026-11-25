import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import { ENV, type Env } from '../config/env.js';
import type { Role } from '../db/schema.js';
import { ANONYMOUS_MAX, type Rating } from '../visibility/visibility.js';

export interface AuthUser {
  id: string;
  email: string | null;
  /**
   * Lo que la persona escribió al registrarse con correo (Supabase lo guarda en user_metadata).
   * Solo se usa una vez, al crear su perfil, y se valida igual que cualquier otro dato.
   */
  signup: { handle?: unknown; birthdate?: unknown };
  /** Cuándo se identificó por última vez de verdad (contraseña, Google, enlace), en segundos. Renovar la sesión no lo cambia. */
  authTime: number;
  /** Lo completa AuthGuard con lo guardado en el perfil. */
  role: Role;
  suspended: boolean;
  /** Clasificación más alta que puede leer, según su edad y Ajustes. También la completa AuthGuard. */
  maxRating: Rating;
}

/**
 * Verifica el token de sesión que emite Supabase Auth.
 * - Proyectos nuevos: firma asimétrica (ES256/RS256). Se valida con las llaves públicas
 *   del proyecto, que se descargan una vez y quedan en memoria.
 * - Proyectos con el secreto heredado (HS256): se valida con SUPABASE_JWT_SECRET.
 */
/**
 * Supabase anota en `amr` cada forma en que la persona se identificó, con su hora. Al renovar la
 * sesión esas horas no cambian: así se distingue "entró hace un rato" de "su sesión sigue viva".
 */
function authTime(payload: JWTPayload): number {
  const amr = Array.isArray(payload.amr) ? (payload.amr as { timestamp?: unknown }[]) : [];
  const times = amr.map((m) => Number(m?.timestamp)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : 0;
}

@Injectable()
export class AuthService {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly secret: Uint8Array | null;

  constructor(@Inject(ENV) env: Env) {
    const base = env.SUPABASE_URL.replace(/\/$/, '');
    this.issuer = `${base}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
    this.secret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: JWTPayload;
    try {
      const { alg } = decodeProtectedHeader(token);
      const options = { issuer: this.issuer, audience: 'authenticated' };
      if (alg === 'HS256') {
        if (!this.secret) throw new Error('token HS256 sin SUPABASE_JWT_SECRET configurado');
        ({ payload } = await jwtVerify(token, this.secret, { ...options, algorithms: ['HS256'] }));
      } else {
        ({ payload } = await jwtVerify(token, this.jwks, options));
      }
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
    if (!payload.sub) throw new UnauthorizedException('Sesión inválida');
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    // Sin correo confirmado no se usa la cuenta (regla 19). Supabase ya no da sesión a quien no
    // confirmó si la confirmación está activada; esto es la segunda capa por si se desactiva.
    if (payload.is_anonymous === true || meta.email_verified === false) {
      throw new ForbiddenException('Confirma tu correo para usar tu cuenta: abre el enlace que te enviamos.');
    }
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      signup: { handle: meta.handle, birthdate: meta.birthdate },
      authTime: authTime(payload),
      role: 'lector',
      suspended: false,
      maxRating: ANONYMOUS_MAX,
    };
  }
}
