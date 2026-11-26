import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { chapterVersions, chapters, stories } from '../db/schema.js';
import { withIds } from './block-ids.js';
import { keepVersion, prune } from './chapter-versions.js';
import type { VersionCopy } from './stories.schemas.js';
import { countWords, StoriesService } from './stories.service.js';

/**
 * El historial de versiones de un capítulo, para quien lo escribe: ver las copias, abrir una,
 * restaurarla o guardar aparte una versión propia. Las copias automáticas las hace StoriesService
 * al guardar y al publicar (ver chapter-versions.ts).
 */
@Injectable()
export class ChapterVersionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(StoriesService) private readonly stories: StoriesService,
  ) {}

  /** Las copias, de la más nueva a la más vieja, sin el texto (para la lista). */
  async list(userId: string, slug: string, chapterId: string) {
    const { chapter } = await this.stories.ownedChapter(userId, slug, chapterId);
    return this.db
      .select({
        id: chapterVersions.id, revision: chapterVersions.revision, title: chapterVersions.title, words: chapterVersions.words,
        reason: chapterVersions.reason, createdAt: chapterVersions.createdAt,
      })
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapter.id))
      .orderBy(desc(chapterVersions.createdAt));
  }

  /** Una copia completa, para verla antes de restaurar. */
  async get(userId: string, slug: string, chapterId: string, versionId: string) {
    const { chapter } = await this.stories.ownedChapter(userId, slug, chapterId);
    const [version] = await this.db.select().from(chapterVersions)
      .where(and(eq(chapterVersions.id, versionId), eq(chapterVersions.chapterId, chapter.id)));
    if (!version) throw new NotFoundException('No encontramos esa versión');
    return version;
  }

  /**
   * Vuelve el capítulo a una copia. Antes guarda cómo estaba, así restaurar tampoco pierde nada.
   * Si el capítulo está publicado, quien lee ve la versión restaurada de inmediato.
   */
  async restore(userId: string, slug: string, chapterId: string, versionId: string) {
    const { story, chapter } = await this.stories.ownedChapter(userId, slug, chapterId);
    const now = new Date();
    const saved = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(chapters).where(eq(chapters.id, chapter.id)).for('update');
      const [version] = await tx.select().from(chapterVersions)
        .where(and(eq(chapterVersions.id, versionId), eq(chapterVersions.chapterId, chapter.id)));
      if (!current || !version) throw new NotFoundException('No encontramos esa versión');
      await keepVersion(tx, current, 'restaurar', now);
      // Los párrafos que siguen iguales conservan su id (y con él sus comentarios).
      const content = withIds(version.content, current.content);
      const [row] = await tx.update(chapters)
        .set({
          title: version.title, titleStyle: version.titleStyle, content, words: countWords(content),
          revision: current.revision + 1, updatedAt: now,
        })
        .where(eq(chapters.id, chapter.id)).returning();
      await tx.update(stories).set({ updatedAt: now }).where(eq(stories.id, story.id));
      return row;
    });
    return this.stories.fullChapter(saved);
  }

  /** Guarda aparte una versión que no se aplica al capítulo: la propia, cuando en un conflicto se elige la otra. */
  async saveCopy(userId: string, slug: string, chapterId: string, copy: VersionCopy) {
    const { chapter } = await this.stories.ownedChapter(userId, slug, chapterId);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(chapterVersions).values({
        chapterId: chapter.id, revision: chapter.revision, title: copy.title, titleStyle: copy.titleStyle ?? null,
        content: copy.content, words: countWords(copy.content), reason: 'conflicto', createdAt: now,
      });
      await prune(tx, chapter.id, now);
    });
    return { saved: true };
  }
}
