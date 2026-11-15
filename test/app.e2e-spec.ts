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

// Las pruebas usan un Postgres en memoria (PGlite) con las mismas migraciones,
// y tokens firmados como los de un proyecto Supabase con secreto HS256.
const SECRET = 'secreto-de-prueba-con-suficiente-longitud';
const env: Env = {
  PORT: 0, DATABASE_URL: 'postgres://sin-usar', SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_JWT_SECRET: SECRET, CORS_ORIGINS: 'http://localhost:3000',
};
const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';

function token(sub: string, email: string, opts: { issuer?: string; secret?: string } = {}) {
  return new SignJWT({ email, role: 'authenticated' })
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
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ana = await token(ANA, 'ana.lee@example.com');
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
});
