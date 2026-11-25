import { Controller, Get, Query, UseGuards, UseInterceptors, Inject } from '@nestjs/common';
import { AuthGuard, CurrentViewer, OptionalAuth } from '../auth/auth.guard.js';
import { PublicCacheInterceptor } from '../common/public-cache.interceptor.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { Viewer } from '../visibility/visibility.js';
import { listSchema, type ListQuery } from './discovery.schemas.js';
import { DiscoveryService } from './discovery.service.js';

/**
 * Buscar y filtrar historias (Explorar). No pide sesión: con sesión se aplican la edad y las
 * etiquetas bloqueadas de quien lee.
 */
@Controller('stories')
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  /**
   * Publicadas, por páginas. Filtros: q, genre, fandom, kind, rating, status, format, length,
   * updated, author, tags (incluir todas), exclude (ninguna); sort; limit y offset. Responde
   * `hasMore` para saber si pedir la página siguiente.
   */
  @Get()
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @UseInterceptors(PublicCacheInterceptor)
  list(@Query(new ZodPipe(listSchema)) query: ListQuery, @CurrentViewer() viewer: Viewer | null) {
    return this.discovery.list(query, viewer);
  }
}
