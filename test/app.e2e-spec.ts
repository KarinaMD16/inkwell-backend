import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { ENV, type Env } from '../src/config/env.js';
import { DB } from '../src/db/db.module.js';
import * as schema from '../src/db/schema.js';
import { S3Storage, STORAGE, type FileStorage } from '../src/storage/storage.js';
import { ACCOUNT_ADMIN, type AccountAdmin } from '../src/auth/auth-admin.js';
import { AUTH_DIRECTORY, type AuthDirectory } from '../src/auth/auth-directory.js';
import sharp from 'sharp';

// Las pruebas usan un Postgres en memoria (PGlite) con las mismas migraciones,
// y tokens firmados como los de un proyecto Supabase con secreto HS256.
const SECRET = 'secreto-de-prueba-con-suficiente-longitud';
const env: Env = {
  PORT: 0, DATABASE_URL: 'postgres://sin-usar', SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_JWT_SECRET: SECRET, CORS_ORIGINS: 'http://localhost:3000', STORAGE_REGION: 'auto',
  AUTH_COOKIE: 'ink_at', TRUST_PROXY: 0, RATE_LIMIT_PER_MINUTE: 300, ADMIN_EMAILS: 'admin@example.com',
};

/** Almacenamiento en memoria: guarda lo subido para poder revisarlo. */
class MemoryStorage implements FileStorage {
  readonly files = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.files.set(key, body);
    return `https://archivos.prueba/${key}`;
  }
  async removeByUrl(url: string) {
    this.files.delete(url.replace('https://archivos.prueba/', ''));
  }
}
const files = new MemoryStorage();
/** Cuentas de Supabase borradas en las pruebas. */
const deletedAccounts: string[] = [];
const accountAdmin: AccountAdmin = { deleteUser: async (id) => { deletedAccounts.push(id); directory.emails.delete(id); } };

/** Correos de las cuentas, como los tendría auth.users (el Postgres de prueba no tiene ese esquema). */
class MemoryDirectory implements AuthDirectory {
  readonly emails = new Map<string, string>();
  async lookup(ids: string[]) {
    return new Map(ids.filter((id) => this.emails.has(id)).map((id) => [id, { email: this.emails.get(id)!, lastSignInAt: null }]));
  }
  async findByEmail(text: string) {
    return [...this.emails].filter(([, email]) => email.includes(text.toLowerCase())).map(([id]) => id);
  }
}
const directory = new MemoryDirectory();
const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';

const CARLA = '33333333-3333-4333-8333-333333333333';
const DANI = '44444444-4444-4444-8444-444444444444';

/** Como un token de Supabase: `meta` es el user_metadata (lo que se escribió al registrarse). */
function token(sub: string, email: string, opts: { issuer?: string; secret?: string; meta?: Record<string, unknown>; anonymous?: boolean; authAgo?: number } = {}) {
  // `amr`: cuándo se identificó de verdad (por defecto, ahora).
  const amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - (opts.authAgo ?? 0) }];
  return new SignJWT({ email, role: 'authenticated', amr, user_metadata: { email_verified: true, ...opts.meta }, is_anonymous: opts.anonymous ?? false })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(opts.issuer ?? 'https://prueba.supabase.co/auth/v1')
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

describe('Inkwell API', () => {
  let app: INestApplication<App>;
  let ana: string;
  let beto: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV).useValue(env)
      .overrideProvider(DB).useValue(db)
      .overrideProvider(STORAGE).useValue(files)
      .overrideProvider(ACCOUNT_ADMIN).useValue(accountAdmin)
      .overrideProvider(AUTH_DIRECTORY).useValue(directory)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    // Ana se registró con correo y eligió su nombre; su fecha de nacimiento la completa después.
    ana = await token(ANA, 'ana.lee@example.com', { meta: { handle: 'ana.lee' } });
    beto = await token(BETO, 'beto@example.com');
  });
  afterAll(async () => {
    await app.close();
  });

  it('responde el estado y llega a la base', async () => {
    await http().get('/health').expect(200).expect({ ok: true, db: true });
  });

  it('rechaza sin sesión, con firma ajena o con otro emisor', async () => {
    await http().get('/me').expect(401);
    await http().get('/me').set('Authorization', 'Bearer no-es-un-token').expect(401);
    const forged = await token(ANA, 'ana.lee@example.com', { secret: 'otro-secreto-distinto-al-del-proyecto' });
    await http().get('/me').set('Authorization', `Bearer ${forged}`).expect(401);
    const foreign = await token(ANA, 'ana.lee@example.com', { issuer: 'https://otro.supabase.co/auth/v1' });
    await http().get('/me').set('Authorization', `Bearer ${foreign}`).expect(401);
  });

  it('crea el perfil la primera vez y permite editarlo', async () => {
    const first = await http().get('/me').set('Authorization', `Bearer ${ana}`).expect(200);
    expect(first.body).toMatchObject({ id: ANA, handle: 'ana.lee' });
    const again = await http().get('/me').set('Authorization', `Bearer ${ana}`).expect(200);
    expect(again.body.handle).toBe('ana.lee');
    const edited = await http().patch('/me').set('Authorization', `Bearer ${ana}`).send({ name: 'Ana', bio: 'Leo de noche.' }).expect(200);
    expect(edited.body).toMatchObject({ name: 'Ana', bio: 'Leo de noche.' });
    await http().patch('/me').set('Authorization', `Bearer ${ana}`).send({ handle: 'Con Espacios' }).expect(400);
  });

  it('no deja tomar un nombre de usuario ajeno', async () => {
    await http().get('/me').set('Authorization', `Bearer ${beto}`).expect(200);
    await http().patch('/me').set('Authorization', `Bearer ${beto}`).send({ handle: 'ana.lee' }).expect(409);
  });

  it('crea historias y capítulos, y solo muestra lo publicado', async () => {
    await http().post('/stories').send({ title: 'Sin sesión', genre: 'Drama' }).expect(401);
    await http().post('/stories').set('Authorization', `Bearer ${ana}`).send({ title: '' }).expect(400);

    const created = await http().post('/stories').set('Authorization', `Bearer ${ana}`)
      .send({ title: 'Órbita baja', genre: 'Ciencia ficción', tropes: ['Espacio'], published: true }).expect(201);
    expect(created.body.slug).toBe('orbita-baja');
    const twin = await http().post('/stories').set('Authorization', `Bearer ${ana}`).send({ title: 'Órbita baja', genre: 'Drama', published: true }).expect(201);
    expect(twin.body.slug).toBe('orbita-baja-2');
    await http().post('/stories/orbita-baja-2/chapters').set('Authorization', `Bearer ${ana}`).send({ title: 'Uno', publish: true }).expect(201);
    await http().post('/stories').set('Authorization', `Bearer ${ana}`).send({ title: 'Borrador secreto', genre: 'Drama' }).expect(201);

    await http().post('/stories/orbita-baja/chapters').set('Authorization', `Bearer ${beto}`).send({ title: 'Intruso' }).expect(403);
    const ch1 = await http().post('/stories/orbita-baja/chapters').set('Authorization', `Bearer ${ana}`)
      .send({ title: 'Despegue', publish: true, content: [{ type: 'p', text: 'Tres, dos, uno.' }] }).expect(201);
    expect(ch1.body.n).toBe(1);
    await http().post('/stories/orbita-baja/chapters').set('Authorization', `Bearer ${ana}`).send({ title: 'Borrador' }).expect(201);
    await http().post('/stories/orbita-baja/chapters').set('Authorization', `Bearer ${ana}`)
      .send({ title: 'Roto', content: [{ type: 'desconocido' }] }).expect(400);

    const list = await http().get('/stories').expect(200);
    expect(list.body.items.map((s: { slug: string }) => s.slug).sort()).toEqual(['orbita-baja', 'orbita-baja-2']);
    const one = await http().get('/stories/orbita-baja').expect(200);
    expect(one.body).toMatchObject({ author: 'ana.lee', chapters: 1, votes: 0, tropes: ['Espacio'] });
    await http().get('/stories/borrador-secreto').expect(404);

    const chaps = await http().get('/stories/orbita-baja/chapters').expect(200);
    expect(chaps.body).toHaveLength(1);
    const read = await http().get('/stories/orbita-baja/chapters/1').expect(200);
    expect(read.body.content[0].text).toBe('Tres, dos, uno.');
    await http().get('/stories/orbita-baja/chapters/2').expect(404);
  });

  it('filtra y busca', async () => {
    const byGenre = await http().get('/stories').query({ genre: 'Drama' }).expect(200);
    expect(byGenre.body.items).toHaveLength(1);
    const byText = await http().get('/stories').query({ q: 'órbita' }).expect(200);
    expect(byText.body.items).toHaveLength(2);
    await http().get('/stories').query({ limit: 500 }).expect(400);
  });

  it('vota una sola vez por persona y permite quitar el voto', async () => {
    const path = '/stories/orbita-baja/chapters/1/vote';
    await http().put(path).expect(401);
    await http().put(path).set('Authorization', `Bearer ${beto}`).expect(200).expect({ voted: true, votes: 1 });
    await http().put(path).set('Authorization', `Bearer ${beto}`).expect(200).expect({ voted: true, votes: 1 });
    await http().put(path).set('Authorization', `Bearer ${ana}`).expect(200).expect({ voted: true, votes: 2 });
    expect((await http().get('/stories/orbita-baja')).body.votes).toBe(2);
    const top = await http().get('/stories').query({ sort: 'votos' }).expect(200);
    expect(top.body.items[0]).toMatchObject({ slug: 'orbita-baja', votes: 2 });
    for (const sort of ['recientes', 'lecturas']) await http().get('/stories').query({ sort }).expect(200);
    await http().delete(path).set('Authorization', `Bearer ${beto}`).expect(200).expect({ voted: false, votes: 1 });
  });

  it('guarda en la repisa, actualiza el progreso y quita', async () => {
    await http().put('/me/library/no-existe').set('Authorization', `Bearer ${beto}`).send({}).expect(404);
    await http().put('/me/library/orbita-baja').set('Authorization', `Bearer ${beto}`).send({}).expect(200);
    await http().put('/me/library/orbita-baja').set('Authorization', `Bearer ${beto}`).send({ chapter: 1 }).expect(200);
    const shelf = await http().get('/me/library').set('Authorization', `Bearer ${beto}`).expect(200);
    expect(shelf.body).toHaveLength(1);
    expect(shelf.body[0]).toMatchObject({ slug: 'orbita-baja', chapter: 1, author: 'ana.lee' });
    expect((await http().get('/me/library').set('Authorization', `Bearer ${ana}`)).body).toHaveLength(0);
    await http().delete('/me/library/orbita-baja').set('Authorization', `Bearer ${beto}`).expect(204);
    expect((await http().get('/me/library').set('Authorization', `Bearer ${beto}`)).body).toHaveLength(0);
  });

  it('muestra perfiles públicos y las historias propias, y publica la historia con su primer capítulo', async () => {
    const pub = await http().get('/profiles/ana.lee').expect(200);
    expect(pub.body).toMatchObject({ handle: 'ana.lee', name: 'Ana', bio: 'Leo de noche.' });
    await http().get('/profiles/nadie').expect(404);

    await http().get('/me/stories').expect(401);
    const mine = await http().get('/me/stories').set('Authorization', `Bearer ${ana}`).expect(200);
    expect(mine.body).toHaveLength(3);
    expect(mine.body.find((s: { slug: string }) => s.slug === 'borrador-secreto')).toMatchObject({ published: false, chapters: 0, totalChapters: 0 });
    expect(mine.body.find((s: { slug: string }) => s.slug === 'orbita-baja')).toMatchObject({ published: true, chapters: 1, totalChapters: 2 });
    expect((await http().get('/me/stories').set('Authorization', `Bearer ${beto}`)).body).toHaveLength(0);

    await http().post('/stories/borrador-secreto/chapters').set('Authorization', `Bearer ${ana}`).send({ title: 'Aún en borrador' }).expect(201);
    await http().get('/stories/borrador-secreto').expect(404);
    await http().post('/stories/borrador-secreto/chapters').set('Authorization', `Bearer ${ana}`).send({ title: 'Sale a la luz', publish: true }).expect(201);
    await http().get('/stories/borrador-secreto').expect(200);
  });

  describe('gestión de historias', () => {
    const auth = () => ({ Authorization: `Bearer ${ana}` });
    const other = () => ({ Authorization: `Bearer ${beto}` });
    const slugs = (body: { items: { slug: string }[] }) => body.items.map((s) => s.slug);
    let draftId: string;

    it('una historia publicada sin capítulos todavía no se ve', async () => {
      await http().post('/stories').set(auth()).send({ title: 'Vacía', genre: 'Humor', published: true }).expect(201);
      await http().get('/stories/vacia').expect(404);
      expect(slugs((await http().get('/stories')).body)).not.toContain('vacia');
    });

    it('crea con etiquetas por categoría y pide fandom a los fanfics', async () => {
      const bad = await http().post('/stories').set(auth()).send({ title: 'Sin fandom', genre: 'Romance', kind: 'Fanfic' }).expect(400);
      expect(bad.body.errors[0].campo).toBe('fandom');
      await http().post('/stories').set(auth()).send({ title: 'Género inventado', genre: 'Cosas' }).expect(400);
      await http().post('/stories').set(auth()).send({
        title: 'El coro', genre: 'Romance', subgenres: ['Drama', 'Romance'], kind: 'Fanfic', fandom: 'Música',
        relation: 'Irene / Dani', characters: ['Irene', 'Dani'], tropes: ['Slow burn', 'slow burn', 'Enemies to lovers'],
        warnings: ['Lenguaje fuerte'], tags: ['Orquesta'],
      }).expect(201);
      const view = await http().get('/me/stories/el-coro').set(auth()).expect(200);
      expect(view.body).toMatchObject({
        kind: 'Fanfic', fandom: 'Música', genre: 'Romance', subgenres: ['Drama'], tropes: ['Slow burn', 'Enemies to lovers'],
        characters: ['Irene', 'Dani'], tags: ['Orquesta'], published: false, chapterList: [], license: 'Todos los derechos reservados',
      });
      await http().get('/me/stories/el-coro').expect(401);
      await http().get('/me/stories/el-coro').set(other()).expect(403);
    });

    it('edita los detalles, unifica la forma de escribir una etiqueta y rechaza campos ajenos', async () => {
      await http().patch('/me/stories/el-coro').set(other()).send({ title: 'Robada' }).expect(403);
      await http().patch('/me/stories/el-coro').set(auth()).send({ slug: 'otro' }).expect(400);
      await http().patch('/me/stories/el-coro').set(auth()).send({ kind: 'Fanfic', fandom: '' }).expect(400);
      // Otra historia de Beto escribe la misma etiqueta de otra forma: queda con el nombre que ya existía.
      await http().post('/stories').set(other()).send({ title: 'Segunda', genre: 'Drama', tropes: ['SLOW  BURN'] }).expect(201);
      expect((await http().get('/me/stories/segunda').set(other())).body.tropes).toEqual(['Slow burn']);

      const edited = await http().patch('/me/stories/el-coro').set(auth())
        .send({ title: 'Lo que dijo el coro', status: 'En pausa', rating: '+13', kind: 'Original', tropes: ['Slow burn'], license: 'CC BY-NC' }).expect(200);
      // Al dejar de ser fanfic pierde el fandom; lo que no se mandó sigue igual.
      expect(edited.body).toMatchObject({
        slug: 'el-coro', title: 'Lo que dijo el coro', status: 'En pausa', rating: '+13', kind: 'Original', fandom: 'Original',
        tropes: ['Slow burn'], characters: ['Irene', 'Dani'], license: 'CC BY-NC',
      });
    });

    it('guarda borradores, los edita y no los muestra a nadie más', async () => {
      const draft = await http().post('/stories/el-coro/chapters').set(auth()).send({ title: '', content: [{ type: 'p', text: 'Uno dos tres' }] }).expect(201);
      expect(draft.body).toMatchObject({ n: 1, title: 'Sin título', state: 'borrador', words: 3 });
      draftId = draft.body.id;
      const saved = await http().patch(`/me/stories/el-coro/chapters/${draftId}`).set(auth())
        .send({ title: 'Ensayo', titleStyle: { face: 'maquina', ornament: 'moon' }, content: [{ type: 'p', text: 'Uno dos tres cuatro', align: 'center', marks: [[0, 3, 'b'], [4, 7, 'i']] }, { type: 'chat', title: 'Chat', messages: [{ who: 'Lau', text: 'hola a todos' }] }] })
        .expect(200);
      expect(saved.body).toMatchObject({ title: 'Ensayo', words: 7, state: 'borrador' });
      const full = await http().get(`/me/stories/el-coro/chapters/${draftId}`).set(auth()).expect(200);
      expect(full.body).toMatchObject({ titleStyle: { face: 'maquina', ornament: 'moon' } });
      expect(full.body.content).toHaveLength(2);
      expect(full.body.content[0]).toMatchObject({ align: 'center', marks: [[0, 3, 'b'], [4, 7, 'i']] });
      await http().patch(`/me/stories/el-coro/chapters/${draftId}`).set(auth()).send({ content: [{ type: 'p', text: 'x', marks: [[0, 1, 'tachado']] }] }).expect(400);
      await http().get(`/me/stories/el-coro/chapters/${draftId}`).set(other()).expect(403);
      await http().patch(`/me/stories/el-coro/chapters/${draftId}`).set(other()).send({ title: 'x' }).expect(403);
      await http().patch(`/me/stories/el-coro/chapters/${draftId}`).set(auth()).send({ publishedAt: '2020-01-01' }).expect(400);
      await http().get('/me/stories/el-coro/chapters/no-es-un-id').set(auth()).expect(400);
      await http().get('/stories/el-coro').expect(404);
    });

    it('publica, programa y vuelve a borrador; quien lee cuenta solo lo publicado', async () => {
      const second = await http().post('/stories/el-coro/chapters').set(auth()).send({ title: 'Segundo', content: [{ type: 'p', text: 'B' }] }).expect(201);
      const third = await http().post('/stories/el-coro/chapters').set(auth()).send({ title: 'Tercero', content: [{ type: 'p', text: 'C' }] }).expect(201);
      // Se publica el tercero: para el público es el capítulo 1, aunque haya dos borradores antes.
      const live = await http().post(`/me/stories/el-coro/chapters/${third.body.id}/publish`).set(auth()).send({}).expect(200);
      expect(live.body.state).toBe('publicado');
      expect((await http().get('/stories/el-coro').expect(200)).body.chapters).toBe(1);
      expect((await http().get('/stories/el-coro/chapters')).body).toMatchObject([{ n: 1, title: 'Tercero' }]);
      expect((await http().get('/stories/el-coro/chapters/1').expect(200)).body.title).toBe('Tercero');
      await http().get('/stories/el-coro/chapters/3').expect(404);

      await http().post(`/me/stories/el-coro/chapters/${second.body.id}/publish`).set(auth()).send({ at: '2020-01-01T00:00:00Z' }).expect(400);
      const later = new Date(Date.now() + 86_400_000).toISOString();
      const scheduled = await http().post(`/me/stories/el-coro/chapters/${second.body.id}/publish`).set(auth()).send({ at: later }).expect(200);
      expect(scheduled.body).toMatchObject({ state: 'programado', publishedAt: later });
      expect((await http().get('/stories/el-coro/chapters')).body).toHaveLength(1);

      const view = await http().get('/me/stories/el-coro').set(auth()).expect(200);
      expect(view.body.chapterList.map((c: { state: string }) => c.state)).toEqual(['borrador', 'programado', 'publicado']);
      expect(view.body).toMatchObject({ published: true, chapters: 1, totalChapters: 3 });

      const back = await http().post(`/me/stories/el-coro/chapters/${second.body.id}/unpublish`).set(auth()).expect(200);
      expect(back.body.state).toBe('borrador');
    });

    it('reordena y borra capítulos sin dejar huecos', async () => {
      const before = (await http().get('/me/stories/el-coro').set(auth())).body.chapterList as { id: string; title: string }[];
      const ids = before.map((c) => c.id);
      await http().put('/me/stories/el-coro/chapters/order').set(auth()).send({ ids: ids.slice(1) }).expect(400);
      await http().put('/me/stories/el-coro/chapters/order').set(other()).send({ ids }).expect(403);
      const moved = await http().put('/me/stories/el-coro/chapters/order').set(auth()).send({ ids: [ids[2], ids[0], ids[1]] }).expect(200);
      expect(moved.body.map((c: { n: number; title: string }) => `${c.n} ${c.title}`)).toEqual(['1 Tercero', '2 Ensayo', '3 Segundo']);
      await http().delete(`/me/stories/el-coro/chapters/${ids[0]}`).set(other()).expect(403);
      await http().delete(`/me/stories/el-coro/chapters/${ids[0]}`).set(auth()).expect(204);
      const after = (await http().get('/me/stories/el-coro').set(auth())).body.chapterList;
      expect(after.map((c: { n: number; title: string }) => `${c.n} ${c.title}`)).toEqual(['1 Tercero', '2 Segundo']);
    });

    it('busca sin tildes y por prefijo, e incluye y excluye etiquetas', async () => {
      expect(slugs((await http().get('/stories').query({ q: 'DIJO cor' })).body)).toEqual(['el-coro']);
      expect(slugs((await http().get('/stories').query({ q: 'slow' })).body)).toEqual(['el-coro']);
      expect(slugs((await http().get('/stories').query({ tags: 'slow-burn' })).body)).toEqual(['el-coro']);
      expect(slugs((await http().get('/stories').query({ tags: 'Slow burn,Irene' })).body)).toEqual(['el-coro']);
      expect(slugs((await http().get('/stories').query({ tags: 'slow-burn,espacio' })).body)).toEqual([]);
      expect(slugs((await http().get('/stories').query({ exclude: 'slow-burn' })).body)).not.toContain('el-coro');
      expect(slugs((await http().get('/stories').query({ genre: 'Drama', exclude: 'espacio' })).body)).toContain('el-coro');
      expect(slugs((await http().get('/stories').query({ status: 'En pausa', rating: '+13', kind: 'Original' })).body)).toEqual(['el-coro']);
    });

    it('autocompleta solo etiquetas de historias visibles', async () => {
      const found = await http().get('/tags').query({ q: 'bur' }).expect(200);
      // "Segunda", de Beto, también la usa, pero sigue en borrador: no cuenta.
      expect(found.body).toEqual([{ kind: 'tropo', name: 'Slow burn', slug: 'slow-burn', uses: 1 }]);
      expect((await http().get('/tags').query({ q: 'iren', kind: 'tropo' })).body).toEqual([]);
      expect((await http().get('/tags').query({ q: 'iren', kind: 'personaje' })).body).toHaveLength(1);
      expect((await http().get('/tags').query({ q: 'romance' })).body).toEqual([]);
      await http().get('/tags').query({ kind: 'genero' }).expect(400);
    });

    it('sube y quita la portada de la historia', async () => {
      const art = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#B9A5F0' } }).jpeg().toBuffer();
      await http().put('/me/stories/el-coro/cover').set(other()).attach('file', art, 'tapa.jpg').expect(403);
      const res = await http().put('/me/stories/el-coro/cover').set(auth()).attach('file', art, 'tapa.jpg').expect(200);
      const meta = await sharp(files.files.get(res.body.cover.replace('https://archivos.prueba/', ''))!).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 800, height: 1200 });
      expect((await http().get('/stories/el-coro')).body.cover).toBe(res.body.cover);
      await http().delete('/me/stories/el-coro/cover').set(auth()).expect(200).expect({ cover: null });
      expect(files.files.size).toBe(0);
    });

    it('esconde la historia entera y la borra', async () => {
      await http().patch('/me/stories/el-coro').set(auth()).send({ published: false }).expect(200);
      await http().get('/stories/el-coro').expect(404);
      await http().get('/stories/el-coro/chapters/1').expect(404);
      expect((await http().get('/tags').query({ q: 'slow' })).body).toEqual([]);
      await http().patch('/me/stories/el-coro').set(auth()).send({ published: true }).expect(200);
      await http().get('/stories/el-coro').expect(200);

      await http().delete('/me/stories/el-coro').set(other()).expect(403);
      await http().delete('/me/stories/el-coro').set(auth()).expect(204);
      await http().get('/me/stories/el-coro').set(auth()).expect(404);
      expect((await http().get('/tags').query({ q: 'slow' })).body).toEqual([]);
      await http().delete('/me/stories/vacia').set(auth()).expect(204);
      await http().delete('/me/stories/segunda').set(other()).expect(204);
    });
  });

  describe('cuentas', () => {
    it('crea el perfil con el nombre y la fecha que se eligieron al registrarse', async () => {
      const carla = await token(CARLA, 'carla@example.com', { meta: { handle: 'Carla.Escribe', birthdate: '2008-03-14' } });
      const me = await http().get('/me').set('Authorization', `Bearer ${carla}`).expect(200);
      expect(me.body).toMatchObject({ handle: 'carla.escribe', birthdate: '2008-03-14' });
    });

    it('nunca saca el nombre de usuario del correo, y no usa nombres reservados ni ocupados', async () => {
      const me = await http().get('/me').set('Authorization', `Bearer ${beto}`).expect(200);
      expect(me.body.handle).toMatch(/^lector\.\d{6}$/);
      const dani = await token(DANI, 'dani@example.com', { meta: { handle: 'soporte', birthdate: '2016-01-01' } });
      const d = await http().get('/me').set('Authorization', `Bearer ${dani}`).expect(200);
      expect(d.body.handle).toMatch(/^lector\.\d{6}$/);
      // Menor de 13: la fecha no se guarda y la cuenta tendrá que completarla.
      expect(d.body.birthdate).toBeNull();
    });

    it('crear el perfil es idempotente aunque lleguen varias peticiones a la vez', async () => {
      const id = '55555555-5555-4555-8555-555555555555';
      const t = await token(id, 'eli@example.com', { meta: { handle: 'eli', birthdate: '2000-01-01' } });
      const all = await Promise.all([1, 2, 3].map(() => http().get('/me').set('Authorization', `Bearer ${t}`)));
      expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(new Set(all.map((r) => r.body.handle))).toEqual(new Set(['eli']));
    });

    it('acepta la sesión en la cookie HttpOnly y frena peticiones de otros sitios (CSRF)', async () => {
      const jar = `otra=1; ink_at=${ana}`;
      const me = await http().get('/me').set('Cookie', jar).expect(200);
      expect(me.body.handle).toBe('ana.lee');
      // Cambiar datos con la cookie exige venir de un origen de Inkwell.
      await http().patch('/me').set('Cookie', jar).send({ bio: 'x' }).expect(403);
      await http().patch('/me').set('Cookie', jar).set('Origin', 'https://malicioso.example').send({ bio: 'x' }).expect(403);
      await http().patch('/me').set('Cookie', jar).set('Origin', 'http://localhost:3000').send({ bio: 'Leo de noche.' }).expect(200);
      // La app nativa manda la sesión en Authorization: ahí no hay cookie que robar y no aplica.
      await http().patch('/me').set('Authorization', `Bearer ${ana}`).send({ bio: 'Leo de noche.' }).expect(200);
      await http().get('/me').set('Cookie', 'ink_at=basura').expect(401);
    });

    it('elimina la cuenta con todo lo suyo, solo si se identificó hace poco', async () => {
      const id = '77777777-7777-4777-8777-777777777777';
      const viejo = await token(id, 'gabi@example.com', { meta: { handle: 'gabi', birthdate: '1999-09-09' }, authAgo: 3600 });
      const auth = { Authorization: `Bearer ${viejo}` };
      await http().post('/stories').set(auth).send({ title: 'De Gabi', genre: 'Drama', tropes: ['Solo de Gabi'] }).expect(201);
      await http().post('/stories/de-gabi/chapters').set(auth).send({ title: 'Uno', publish: true }).expect(201);
      const denied = await http().delete('/me').set(auth).expect(403);
      expect(denied.body.code).toBe('reauth');

      const fresco = await token(id, 'gabi@example.com', { authAgo: 30 });
      await http().delete('/me').set('Authorization', `Bearer ${fresco}`).expect(204);
      expect(deletedAccounts).toContain(id);
      await http().get('/profiles/gabi').expect(404);
      await http().get('/stories/de-gabi').expect(404);
      const tags = await http().get('/tags').query({ q: 'solo de' }).expect(200);
      expect(JSON.stringify(tags.body)).not.toContain('Solo de Gabi');
    });

    it('rechaza cuentas sin correo confirmado y anónimas', async () => {
      const id = '66666666-6666-4666-8666-666666666666';
      await http().get('/me').set('Authorization', `Bearer ${await token(id, 'f@example.com', { meta: { email_verified: false } })}`).expect(403);
      await http().get('/me').set('Authorization', `Bearer ${await token(id, 'f@example.com', { anonymous: true })}`).expect(403);
    });

    it('no deja tomar nombres reservados, tampoco disfrazados', async () => {
      for (const handle of ['admin', 'Inkwell', 'a.d.m.i.n', 'soporte_', 'koral.studio']) {
        await http().patch('/me').set('Authorization', `Bearer ${beto}`).send({ handle }).expect(400);
      }
    });

    it('dos personas pidiendo el mismo nombre a la vez: una lo obtiene y la otra recibe 409', async () => {
      const res = await Promise.all([beto, ana].map((t) => http().patch('/me').set('Authorization', `Bearer ${t}`).send({ handle: 'el.mismo' })));
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      await http().patch('/me').set('Authorization', `Bearer ${ana}`).send({ handle: 'ana.lee' }).expect(200);
    });
  });

  describe('perfil completo', () => {
    const auth = () => ({ Authorization: `Bearer ${ana}` });

    it('devuelve el correo de la cuenta y los datos privados solo en /me', async () => {
      const me = await http().get('/me').set(auth()).expect(200);
      expect(me.body).toMatchObject({ email: 'ana.lee@example.com', link: null, avatarUrl: null, bannerUrl: null, birthdate: null });
      await http().patch('/me').set(auth()).send({ birthdate: '2001-05-09' }).expect(200);
      // Una vez puesta no cambia (salvo reenviar la misma, que no hace nada).
      await http().patch('/me').set(auth()).send({ birthdate: '2001-05-09' }).expect(200);
      const locked = await http().patch('/me').set(auth()).send({ birthdate: '1990-01-01' }).expect(409);
      expect(locked.body.errors[0]).toMatchObject({ campo: 'birthdate' });
      const pub = await http().get('/profiles/ana.lee').expect(200);
      expect(pub.body).not.toHaveProperty('email');
      expect(pub.body).not.toHaveProperty('birthdate');
      expect(pub.body).not.toHaveProperty('id');
    });

    it('valida y normaliza el enlace', async () => {
      const ok = await http().patch('/me').set(auth()).send({ link: '  instagram.com/ana.lee ' }).expect(200);
      expect(ok.body.link).toBe('https://instagram.com/ana.lee');
      for (const link of ['javascript:alert(1)', 'mailto:ana@example.com', 'ftp://x.com', 'no es un enlace', `https://x.com/${'a'.repeat(250)}`]) {
        await http().patch('/me').set(auth()).send({ link }).expect(400);
      }
      expect((await http().patch('/me').set(auth()).send({ link: '' }).expect(200)).body.link).toBeNull();
      expect((await http().get('/profiles/ana.lee')).body.link).toBeNull();
    });

    it('valida la fecha de nacimiento, el nombre y la descripción', async () => {
      for (const birthdate of ['2030-01-01', '2001-02-30', '2020-01-01', '1800-01-01', 'ayer', null]) {
        await http().patch('/me').set(auth()).send({ birthdate }).expect(400);
      }
      await http().patch('/me').set(auth()).send({ name: '   ' }).expect(400);
      await http().patch('/me').set(auth()).send({ bio: 'x'.repeat(301) }).expect(400);
      const trimmed = await http().patch('/me').set(auth()).send({ name: '  Ana Lee  ', bio: ' Leo de noche. ' }).expect(200);
      expect(trimmed.body).toMatchObject({ name: 'Ana Lee', bio: 'Leo de noche.' });
    });

    it('no deja escribir las imágenes ni otros campos a mano', async () => {
      await http().patch('/me').set(auth()).send({ avatarUrl: 'https://malicioso.example/x.png' }).expect(400);
      await http().patch('/me').set(auth()).send({ id: BETO }).expect(400);
    });

    it('sube, comprime, reemplaza y quita la foto de perfil', async () => {
      // Foto "de celular": grande, con ubicación GPS en los metadatos.
      const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#2EC4B6' } })
        .jpeg().withExif({ IFD0: { Make: 'Telefono' }, GPS: { GPSLatitudeRef: 'N' } }).toBuffer();
      await http().put('/me/avatar').attach('file', photo, 'foto.jpg').expect(401);

      const first = await http().put('/me/avatar').set(auth()).attach('file', photo, 'foto.jpg').expect(200);
      expect(first.body.avatarUrl).toMatch(/^https:\/\/archivos\.prueba\/avatars\/11111111-1111-4111-8111-111111111111\/.+\.webp$/);
      const stored = files.files.get(first.body.avatarUrl.replace('https://archivos.prueba/', ''))!;
      const meta = await sharp(stored).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 400, height: 400 });
      expect(meta.exif).toBeUndefined();
      expect((await http().get('/profiles/ana.lee')).body.avatarUrl).toBe(first.body.avatarUrl);

      const second = await http().put('/me/avatar').set(auth()).attach('file', photo, 'otra.jpg').expect(200);
      expect(second.body.avatarUrl).not.toBe(first.body.avatarUrl);
      expect(files.files.size).toBe(1); // la anterior se borró

      const gone = await http().delete('/me/avatar').set(auth()).expect(200);
      expect(gone.body.avatarUrl).toBeNull();
      expect(files.files.size).toBe(0);
    });

    it('sube la portada a 1500×500', async () => {
      const wide = await sharp({ create: { width: 3000, height: 2000, channels: 4, background: '#DD5D4F' } }).png().toBuffer();
      const res = await http().put('/me/banner').set(auth()).attach('file', wide, 'portada.png').expect(200);
      const meta = await sharp(files.files.get(res.body.bannerUrl.replace('https://archivos.prueba/', ''))!).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 1500, height: 500 });
      await http().delete('/me/banner').set(auth()).expect(200);
    });

    it('rechaza archivos que no son imágenes, vacíos o demasiado grandes', async () => {
      await http().put('/me/avatar').set(auth()).attach('file', Buffer.from('<svg onload="alert(1)"/>'), 'x.svg').expect(400);
      await http().put('/me/avatar').set(auth()).attach('file', Buffer.from('hola'), 'foto.jpg').expect(400);
      await http().put('/me/avatar').set(auth()).expect(400);
      const huge = await http().put('/me/avatar').set(auth()).attach('file', Buffer.alloc(9 * 1024 * 1024, 1), 'grande.jpg').expect(413);
      expect(huge.body.message).toMatch(/máximo es 8 MB/);
    });

    it('las variables de almacenamiento vacías en el .env no impiden arrancar', async () => {
      const { loadEnv } = await import('../src/config/env.js');
      const parsed = loadEnv({ ...env, STORAGE_ENDPOINT: '', STORAGE_PUBLIC_URL: '', STORAGE_BUCKET: '', STORAGE_REGION: '' } as never);
      expect(parsed.STORAGE_ENDPOINT).toBeUndefined();
      expect(parsed.STORAGE_REGION).toBe('auto');
    });

    it('sin almacenamiento configurado, la subida responde 503 y el resto sigue andando', async () => {
      const storage = new S3Storage(env);
      await expect(storage.put('x', Buffer.from('x'), 'image/webp')).rejects.toMatchObject({ status: 503 });
      await expect(storage.removeByUrl('https://otro.example/x')).resolves.toBeUndefined();
    });
  });
  describe('gestión de usuarios', () => {
    // Cuentas propias de este bloque: Carla es admin por ADMIN_EMAILS.
    const CARLA = '77777777-7777-4777-8777-777777777777';
    const DANI = '88888888-8888-4888-8888-888888888888';
    const EVA = '99999999-9999-4999-8999-999999999999';
    let carla: string;
    let dani: string;
    let eva: string;
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });
    const slugs = (body: { items: { slug: string }[] }) => body.items.map((x) => x.slug);
    const uses = async (q: string) => ((await http().get('/tags').query({ q })).body as { uses: number }[])[0]?.uses ?? 0;

    beforeAll(async () => {
      carla = await token(CARLA, 'admin@example.com');
      dani = await token(DANI, 'dani.borra@example.com');
      eva = await token(EVA, 'eva@example.com');
      for (const [id, email] of [[ANA, 'ana.lee@example.com'], [BETO, 'beto@example.com'], [CARLA, 'admin@example.com'], [DANI, 'dani.borra@example.com'], [EVA, 'eva@example.com']]) {
        directory.emails.set(id, email);
      }
      // Una historia propia para moderar, con una etiqueta que no usa nadie más.
      await http().post('/stories').set(as(ana)).send({ title: 'Para moderar', genre: 'Drama', tropes: ['Tropo de moderación'] }).expect(201);
      await http().post('/stories/para-moderar/chapters').set(as(ana)).send({ title: 'Uno', publish: true, content: [{ type: 'p', text: 'Hola.' }] }).expect(201);
    });

    it('ADMIN_EMAILS da rol admin a su cuenta', async () => {
      expect((await http().get('/me').set(as(carla)).expect(200)).body).toMatchObject({ role: 'admin', suspendedAt: null });
      expect((await http().get('/me').set(as(ana))).body.role).toBe('lector');
    });

    it('el panel pide sesión y al menos rol moderador', async () => {
      await http().get('/admin/users').expect(401);
      await http().get('/admin/users').set(as(ana)).expect(403);
      await http().get('/admin/stories').set(as(ana)).expect(403);
    });

    it('admin cambia roles, pero no el propio', async () => {
      await http().patch(`/admin/users/${BETO}/role`).set(as(carla)).send({ role: 'jefa' }).expect(400);
      const res = await http().patch(`/admin/users/${BETO}/role`).set(as(carla)).send({ role: 'moderador' }).expect(200);
      expect(res.body).toMatchObject({ handle: expect.any(String), role: 'moderador', email: 'beto@example.com' });
      await http().patch(`/admin/users/${CARLA}/role`).set(as(carla)).send({ role: 'lector' }).expect(403);
      // Moderación no da roles.
      await http().patch(`/admin/users/${ANA}/role`).set(as(beto)).send({ role: 'moderador' }).expect(403);
    });

    it('lista cuentas con correo y busca por @, nombre o correo', async () => {
      const all = await http().get('/admin/users').set(as(beto)).expect(200);
      expect(all.body.total).toBeGreaterThanOrEqual(3);
      const byEmail = await http().get('/admin/users').query({ q: 'ana.lee@' }).set(as(beto)).expect(200);
      expect(byEmail.body.items).toEqual([expect.objectContaining({ id: ANA, email: 'ana.lee@example.com', stories: expect.any(Number) })]);
      const mods = await http().get('/admin/users').query({ role: 'moderador' }).set(as(beto)).expect(200);
      expect(mods.body.items.map((u: { id: string }) => u.id)).toEqual([BETO]);
    });

    it('suspender esconde perfil e historias, impide escribir y se puede revertir', async () => {
      expect(await uses('tropo-de-moderacion')).toBe(1);
      await http().post(`/admin/users/${ANA}/suspend`).set(as(beto)).send({}).expect(400);
      const res = await http().post(`/admin/users/${ANA}/suspend`).set(as(beto)).send({ reason: 'Spam en comentarios' }).expect(201);
      expect(res.body).toMatchObject({ id: ANA, suspendedReason: 'Spam en comentarios', suspendedAt: expect.any(String) });

      await http().get('/profiles/ana.lee').expect(404);
      await http().get('/stories/para-moderar').expect(404);
      await http().get('/stories/para-moderar/chapters/1').expect(404);
      expect(slugs((await http().get('/stories').query({ limit: 50 })).body)).not.toContain('para-moderar');
      expect(await uses('tropo-de-moderacion')).toBe(0);

      // Puede leer y ver su perfil, no escribir.
      expect((await http().get('/me').set(as(ana)).expect(200)).body.suspendedReason).toBe('Spam en comentarios');
      const blocked = await http().post('/stories').set(as(ana)).send({ title: 'No debería', genre: 'Drama' }).expect(403);
      expect(blocked.body.message).toMatch(/suspendida/);
      await http().patch('/me').set(as(ana)).send({ bio: 'x' }).expect(403);

      await http().post(`/admin/users/${ANA}/unsuspend`).set(as(beto)).expect(201);
      await http().get('/profiles/ana.lee').expect(200);
      await http().get('/stories/para-moderar').expect(200);
      expect(await uses('tropo-de-moderacion')).toBe(1);
    });

    it('solo se modera a quien tiene menos permisos, y nunca a una misma', async () => {
      await http().post(`/admin/users/${CARLA}/suspend`).set(as(beto)).send({ reason: 'Intento' }).expect(403);
      await http().post(`/admin/users/${BETO}/suspend`).set(as(beto)).send({ reason: 'Intento' }).expect(403);
      await http().post(`/admin/users/${CARLA}/suspend`).set(as(carla)).send({ reason: 'Intento' }).expect(403);
      await http().post('/admin/users/no-es-un-id/suspend').set(as(carla)).send({ reason: 'Intento' }).expect(400);
      await http().post('/admin/users/66666666-6666-4666-8666-666666666666/suspend').set(as(carla)).send({ reason: 'Intento' }).expect(404);
    });

    it('retirar una historia la esconde del público pero no de su autora', async () => {
      await http().post('/admin/stories/para-moderar/remove').set(as(beto)).send({ reason: 'Contenido sin advertencias' }).expect(201);
      await http().get('/stories/para-moderar').expect(404);
      expect(await uses('tropo-de-moderacion')).toBe(0);
      const mine = (await http().get('/me/stories').set(as(ana))).body.find((x: { slug: string }) => x.slug === 'para-moderar');
      expect(mine).toMatchObject({ removedReason: 'Contenido sin advertencias', removedAt: expect.any(String) });
      const retired = await http().get('/admin/stories').query({ estado: 'retiradas' }).set(as(beto)).expect(200);
      expect(slugs(retired.body)).toEqual(['para-moderar']);

      await http().post('/admin/stories/para-moderar/restore').set(as(beto)).expect(201);
      await http().get('/stories/para-moderar').expect(200);
      expect(await uses('tropo-de-moderacion')).toBe(1);
      await http().post('/admin/stories/no-existe/remove').set(as(beto)).send({ reason: 'Nada' }).expect(404);
    });

    it('todo queda en el registro, lo más nuevo primero', async () => {
      const log = await http().get('/admin/actions').set(as(beto)).expect(200);
      expect(log.body.map((a: { action: string }) => a.action).slice(0, 5)).toEqual(['restaurar', 'retirar', 'reactivar', 'suspender', 'rol']);
      expect(log.body[3]).toMatchObject({ actor: expect.stringMatching(/^@/), targetLabel: '@ana.lee', detail: 'Spam en comentarios' });
    });

    it('descarga una copia de todos tus datos', async () => {
      const res = await http().get('/me/export').set(as(ana)).expect(200);
      expect(res.headers['content-disposition']).toMatch(/inkwell-mis-datos\.json/);
      expect(res.body.cuenta).toEqual({ id: ANA, correo: 'ana.lee@example.com' });
      const story = res.body.historias.find((x: { slug: string }) => x.slug === 'para-moderar');
      expect(story.capitulos[0]).toMatchObject({ titulo: 'Uno', contenido: [{ type: 'p', text: 'Hola.' }] });
    });

    it('una cuenta suspendida igual puede borrarse', async () => {
      const me = (await http().get('/me').set(as(dani)).expect(200)).body;
      await http().post('/stories').set(as(dani)).send({ title: 'De Dani', genre: 'Humor' }).expect(201);
      await http().post(`/admin/users/${DANI}/suspend`).set(as(carla)).send({ reason: 'Prueba' }).expect(201);
      await http().delete('/me').set(as(dani)).expect(204);
      expect(deletedAccounts).toContain(DANI);
      await http().get(`/profiles/${me.handle}`).expect(404);
      expect((await http().get('/admin/users').query({ q: me.handle }).set(as(carla))).body.items).toEqual([]);
    });

    it('administración puede borrar cuentas; moderación no', async () => {
      await http().get('/me').set(as(eva)).expect(200);
      await http().delete(`/admin/users/${EVA}`).set(as(beto)).expect(403);
      await http().delete(`/admin/users/${CARLA}`).set(as(carla)).expect(403);
      await http().delete(`/admin/users/${EVA}`).set(as(carla)).expect(204);
      expect(deletedAccounts).toContain(EVA);
      expect((await http().get('/admin/actions').set(as(carla))).body[0]).toMatchObject({ action: 'borrar cuenta', targetKind: 'perfil' });
    });
  });
  describe('clasificación por edad', () => {
    const AUTORA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
    const TEEN = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
    const DIECISIETE = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
    const ADULTA = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
    /** Fecha de nacimiento de alguien que cumplió `years` hace un mes. */
    const born = (years: number) => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - years);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d.toISOString().slice(0, 10);
    };
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });
    const SLUGS = { 'Todo público': 'edad-todo-publico', '+13': 'edad-mas-13', '+16': 'edad-mas-16', '+18': 'edad-mas-18' } as const;
    const listed = async (headers: Record<string, string> = {}) =>
      ((await http().get('/stories').query({ q: 'Edad', limit: 50 }).set(headers).expect(200)).body.items as { slug: string }[])
        .map((x) => x.slug).filter((x) => x.startsWith('edad-')).sort((a, b) => a.localeCompare(b));
    let autora: string;
    let teen: string;
    let diecisiete: string;
    let adulta: string;

    beforeAll(async () => {
      autora = await token(AUTORA, 'autora.edad@example.com', { meta: { handle: 'autora.edad', birthdate: born(30) } });
      teen = await token(TEEN, 'teen@example.com', { meta: { handle: 'lee.teen', birthdate: born(14) } });
      diecisiete = await token(DIECISIETE, 'diecisiete@example.com', { meta: { handle: 'lee.diecisiete', birthdate: born(17) } });
      adulta = await token(ADULTA, 'adulta@example.com', { meta: { handle: 'lee.adulta', birthdate: born(25) } });
      for (const t of [teen, diecisiete, adulta]) await http().get('/me').set(as(t)).expect(200);
      const titles = { 'Todo público': 'Edad todo publico', '+13': 'Edad mas 13', '+16': 'Edad mas 16', '+18': 'Edad mas 18' };
      for (const [rating, title] of Object.entries(titles)) {
        const res = await http().post('/stories').set(as(autora)).send({ title, genre: 'Drama', rating }).expect(201);
        expect(res.body.slug).toBe(SLUGS[rating as keyof typeof SLUGS]);
        await http().post(`/stories/${res.body.slug}/chapters`).set(as(autora)).send({ title: 'Uno', publish: true, content: [{ type: 'p', text: 'Hola.' }] }).expect(201);
      }
    });

    it('sin cuenta y de 13 a 15 años: todo público y +13', async () => {
      expect(await listed()).toEqual(['edad-mas-13', 'edad-todo-publico']);
      expect(await listed(as(teen))).toEqual(['edad-mas-13', 'edad-todo-publico']);
      for (const headers of [{}, as(teen)]) {
        await http().get('/stories/edad-mas-16').set(headers).expect(404);
        await http().get('/stories/edad-mas-16/chapters').set(headers).expect(404);
        await http().get('/stories/edad-mas-18/chapters/1').set(headers).expect(404);
      }
      await http().get('/stories/edad-mas-13/chapters/1').set(as(teen)).expect(200);
    });

    it('de 16 a 17 años: hasta +16, y no puede activar +18', async () => {
      expect(await listed(as(diecisiete))).toEqual(['edad-mas-13', 'edad-mas-16', 'edad-todo-publico']);
      await http().get('/stories/edad-mas-16/chapters/1').set(as(diecisiete)).expect(200);
      await http().get('/stories/edad-mas-18').set(as(diecisiete)).expect(404);
      const denied = await http().patch('/me').set(as(diecisiete)).send({ showMature: true }).expect(400);
      expect(denied.body.errors[0]).toMatchObject({ campo: 'showMature' });
    });

    it('mayor de edad: +18 solo si lo activa', async () => {
      expect(await listed(as(adulta))).toEqual(['edad-mas-13', 'edad-mas-16', 'edad-todo-publico']);
      expect((await http().patch('/me').set(as(adulta)).send({ showMature: true }).expect(200)).body.showMature).toBe(true);
      expect(await listed(as(adulta))).toEqual(['edad-mas-13', 'edad-mas-16', 'edad-mas-18', 'edad-todo-publico']);
      await http().get('/stories/edad-mas-18/chapters/1').set(as(adulta)).expect(200);
      await http().patch('/me').set(as(adulta)).send({ showMature: false }).expect(200);
      await http().get('/stories/edad-mas-18').set(as(adulta)).expect(404);
    });

    it('la autora siempre ve lo suyo, aunque no le toque por edad', async () => {
      const joven = await token(TEEN, 'teen@example.com');
      await http().post('/stories').set(as(joven)).send({ title: 'Edad propia', genre: 'Drama', rating: '+18' }).expect(201);
      await http().post('/stories/edad-propia/chapters').set(as(joven)).send({ title: 'Uno', publish: true, content: [{ type: 'p', text: 'Mío.' }] }).expect(201);
      await http().get('/stories/edad-propia/chapters/1').set(as(joven)).expect(200);
      await http().get('/stories/edad-propia').expect(404);
    });

    it('los votos y la repisa solo aceptan lo que la persona puede ver', async () => {
      await http().put('/stories/edad-mas-16/chapters/1/vote').set(as(teen)).expect(404);
      await http().put('/me/library/edad-mas-16').set(as(teen)).send({}).expect(404);
      await http().put('/me/library/edad-mas-13').set(as(teen)).send({}).expect(200);
      await http().put('/me/library/edad-mas-16').set(as(diecisiete)).send({}).expect(200);
    });

    it('solo se cachea en público lo que se ve sin cuenta', async () => {
      const anon = await http().get('/stories/edad-mas-13').expect(200);
      expect(anon.headers['cache-control']).toMatch(/^public/);
      const mine = await http().get('/stories/edad-mas-13').set(as(teen)).expect(200);
      expect(mine.headers['cache-control']).toBe('private, no-store');
      expect((await http().get('/stories/edad-mas-13/chapters/1')).headers['cache-control']).toBe('no-store');
    });

    it('una sesión vencida no se trata como lectura sin cuenta', async () => {
      await http().get('/stories').set('Authorization', 'Bearer vencido').expect(401);
    });
  });
});
