# Inkwell · API

Backend de Inkwell: NestJS + Postgres de Supabase (con Drizzle) y sesiones de Supabase Auth.

Todas las escrituras pasan por esta API. La base tiene RLS activado y sin políticas, así que la
API de datos de Supabase no puede leer ni escribir nada por su cuenta: es la segunda capa de protección.

## Puesta en marcha

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
# completa .env con los datos de tu proyecto Supabase (ver abajo)
npm run db:migrate       # crea las tablas
npm run db:seed          # opcional: carga las 12 historias de muestra
npm run start:dev        # http://localhost:3001
```

Requiere Node 20.12 o superior. Si `npm install` falla con "Cannot read properties of null (reading 'edgesOut')",
actualiza npm con `npm install -g npm@latest`.

Para comprobar que quedó conectada: abre `http://localhost:3001/health`. Debe responder `{"ok":true,"db":true}`.

## Variables de entorno

| Variable | De dónde sale |
|---|---|
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler**. Cambia `[YOUR-PASSWORD]` por la contraseña de la base. |
| `SUPABASE_URL` | Supabase → **Project Settings** → **API** → Project URL. |
| `SUPABASE_JWT_SECRET` | Solo si el proyecto usa el secreto heredado (HS256). Con llaves asimétricas va vacío. |
| `CORS_ORIGINS` | Dominios del frontend, separados por coma. |
| `PORT` | Puerto local; por defecto 3001. |

## Endpoints

Lectura, sin sesión:

| Método y ruta | Qué hace |
|---|---|
| `GET /health` | Estado de la API y de la conexión a la base |
| `GET /stories` | Lista publicadas. Admite `q`, `genre`, `status`, `author`, `sort` (`votos`, `recientes`, `lecturas`), `limit`, `offset` |
| `GET /stories/:slug` | Ficha de una historia |
| `GET /stories/:slug/chapters` | Índice de capítulos publicados |
| `GET /stories/:slug/chapters/:n` | Un capítulo con su contenido |
| `GET /profiles/:handle` | Perfil público: nombre de usuario, nombre y presentación |

Con sesión (`Authorization: Bearer <access_token de Supabase>`):

| Método y ruta | Qué hace |
|---|---|
| `GET /me` | Tu perfil; lo crea la primera vez |
| `PATCH /me` | Cambia `handle`, `name` o `bio` |
| `GET /me/stories` | Tus historias, publicadas o no, con `published` y `totalChapters` |
| `POST /stories` | Crea una historia |
| `POST /stories/:slug/chapters` | Agrega un capítulo (solo quien escribe la historia). Con `publish: true` también publica la historia |
| `PUT` / `DELETE /stories/:slug/chapters/:n/vote` | Vota o quita el voto |
| `GET /me/library` | Tu repisa |
| `PUT /me/library/:slug` | Guarda la historia o actualiza el capítulo por el que vas |
| `DELETE /me/library/:slug` | La quita de la repisa |

## Base de datos

- El esquema vive en `src/db/schema.ts`. Tablas: `profiles`, `stories`, `chapters`, `library`, `votes`.
- Para cambiarlo: edita el esquema, corre `npm run db:generate` (crea un SQL en `drizzle/`) y luego `npm run db:migrate`.
- Las migraciones se versionan en el repositorio; no se editan tablas a mano en el panel de Supabase.
- El contenido de los capítulos es JSON por bloques (`Block`), el mismo formato del frontend.

## Pruebas

```bash
npm run test:e2e
```

Corren contra un Postgres en memoria (PGlite) con las mismas migraciones, así que no necesitan Supabase ni internet.

## Pendiente

Comentarios, seguir autores, notificaciones, subida de portadas (Storage o R2), importación de .docx,
publicación programada desde el editor, reportes y moderación.
