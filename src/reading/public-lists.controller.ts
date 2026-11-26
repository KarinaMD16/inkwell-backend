import { BadRequestException, Controller, Get, Header, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentViewer, OptionalAuth } from '../auth/auth.guard.js';
import type { Viewer } from '../visibility/visibility.js';
import { ListsService } from './lists.service.js';

/**
 * Listas públicas: se ven sin cuenta, con el enlace o desde el perfil de su dueña. Con sesión, la edad
 * de la cuenta decide qué historias se ven; por eso nada de esto se guarda en caché pública.
 */
@Controller('lists')
@UseGuards(AuthGuard)
@OptionalAuth()
export class PublicListsController {
  constructor(@Inject(ListsService) private readonly lists: ListsService) {}

  /** Las listas públicas de un perfil: GET /lists?user=handle. */
  @Get()
  @Header('Cache-Control', 'no-store')
  ofUser(@CurrentViewer() viewer: Viewer | null, @Query('user') user?: string) {
    if (!user) throw new BadRequestException('Falta el perfil: /lists?user=nombre');
    return this.lists.publicOf(viewer, user);
  }

  /** Una lista: la tuya siempre; la de otra persona, solo si es pública. */
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@CurrentViewer() viewer: Viewer | null, @Param('id') id: string) {
    return this.lists.get(viewer, id);
  }
}
