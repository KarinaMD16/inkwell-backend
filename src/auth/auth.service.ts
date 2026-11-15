import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import { ENV, type Env } from '../config/env.js';

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Verifica el token de sesión que emite Supabase Auth.
 * - Proyectos nuevos: firma asimétrica (ES256/RS256). Se valida con las llaves públicas
 *   del proyecto, que se descargan una vez y quedan en memoria.
 * - Proyectos con el secreto heredado (HS256): se valida con SUPABASE_JWT_SECRET.
 */
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
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  }
}
