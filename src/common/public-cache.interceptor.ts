import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Caché de la lectura pública. Solo se guarda en cachés compartidas (CDN, proxies) lo que ve
 * alguien sin cuenta, que es lo apto para cualquier edad. Lo que se responde con sesión depende de
 * la edad de esa persona, así que nunca se comparte.
 */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const signedIn = Boolean(http.getRequest<Request & { user?: unknown }>().user);
    const res = http.getResponse<Response>();
    res.setHeader('Cache-Control', signedIn ? 'private, no-store' : 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('Vary', 'Cookie, Authorization');
    return next.handle();
  }
}
