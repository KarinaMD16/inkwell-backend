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
npm run db:limpiar-muestra  # borra los datos del antiguo seed (agrega -- --borrar para confirmar)
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
| `CORS_ORIGINS` | Dominios del frontend, separados por coma. Nunca `*`: la sesión viaja en una cookie. |
| `AUTH_COOKIE` | Nombre de la cookie HttpOnly de sesión (por defecto `ink_at`). El mismo del frontend. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → **Project Settings** → **API** → `service_role`. Secreta: solo para eliminar cuentas. Sin ella, `DELETE /me` responde 503. |
| `TRUST_PROXY` | Proxies delante de la API (Render: `1`), para que el límite de peticiones vea la IP real. |
| `RATE_LIMIT_PER_MINUTE` | Peticiones por minuto por IP (300). Cambios de cuenta y subidas: 20; eliminar cuenta: 5 por hora. |
| `PORT` | Puerto local; por defecto 3001. |
| `STORAGE_*` | Almacenamiento de imágenes compatible con S3. Ver **Imágenes** más abajo. Opcionales: sin ellas, solo la subida de imágenes responde 503. |

## Endpoints

Lectura, sin sesión:

| Método y ruta | Qué hace |
|---|---|
| `GET /health` | Estado de la API y de la conexión a la base |
| `GET /stories` | Lista las visibles (publicadas y con al menos un capítulo fuera). Admite `q` (sin tildes y por prefijo), `genre`, `kind`, `rating`, `status`, `author`, `tags` (incluir, separadas por coma), `exclude` (excluir), `sort` (`votos`, `recientes`, `lecturas`), `limit`, `offset` |
| `GET /stories/:slug` | Ficha de una historia |
| `GET /stories/:slug/chapters` | Índice de capítulos publicados |
| `GET /stories/:slug/chapters/:n` | Un capítulo con su contenido. `n` cuenta solo lo publicado: los borradores no dejan huecos |
| `GET /tags` | Autocompletar etiquetas de historias visibles. Admite `q`, `kind` (`fandom`, `personaje`, `relacion`, `tropo`, `advertencia`, `libre`), `limit` |
| `GET /profiles/:handle` | Perfil público: `handle`, `name`, `bio`, `link`, `avatarUrl`, `bannerUrl`, `createdAt`. Nunca el correo ni la fecha de nacimiento |

Con sesión: la web la manda en la cookie HttpOnly `ink_at` (y entonces los cambios solo se aceptan desde un origen de `CORS_ORIGINS`); la app nativa, en `Authorization: Bearer <access_token de Supabase>`. Se rechazan cuentas sin correo confirmado.

| Método y ruta | Qué hace |
|---|---|
| `GET /me` | Tu perfil completo, con `email` (sale del token) y `birthdate`. Lo crea la primera vez con el nombre y la fecha elegidos al registrarse (si el nombre no sirve, da uno provisional `lector.NNNNNN`) |
| `PATCH /me` | Cambia `handle`, `name`, `bio` (300), `link` (http/https; sin protocolo se agrega `https://`; `""` lo quita) o `birthdate` (`AAAA-MM-DD`, mínimo 13 años; se pone una sola vez y después responde 409). Nombres reservados (`admin`, `soporte`, `inkwell`…) no se aceptan |
| `PUT /me/avatar` | Sube la foto de perfil (`multipart/form-data`, campo `file`, máx. 8 MB). Queda en 400×400 WebP |
| `PUT /me/banner` | Sube la portada del perfil. Queda en 1500×500 WebP |
| `DELETE /me/avatar` · `DELETE /me/banner` | Quita la imagen y la borra del almacenamiento |
| `DELETE /me` | Elimina la cuenta y todo lo suyo (perfil, historias, votos, repisa, imágenes y la cuenta de Supabase). Pide haberse identificado hace menos de 10 min; si no, 403 con `code: "reauth"` |
| `GET /me/stories` | Tus historias, publicadas o no, con `published` y `totalChapters` |
| `POST /stories` | Crea una historia (nace como borrador) |
| `GET /me/stories/:slug` | La ficha completa y todos sus capítulos (`chapterList`), cada uno con `state`: `borrador`, `programado` o `publicado` |
| `PATCH /me/stories/:slug` | Cambia detalles: título, géneros, etiquetas, clasificación, `status`, `license`… `published: false` la esconde entera |
| `DELETE /me/stories/:slug` | Borra la historia con todo lo suyo |
| `PUT` / `DELETE /me/stories/:slug/cover` | Sube (queda en 800×1200 WebP) o quita la portada |
| `POST /stories/:slug/chapters` | Crea un capítulo, por defecto en borrador. Con `publish: true` también publica la historia |
| `GET` / `PATCH` / `DELETE /me/stories/:slug/chapters/:id` | Lee, guarda (título, estilo del título, contenido) o borra un capítulo propio |
| `POST /me/stories/:slug/chapters/:id/publish` | Publica ya o, con `at`, programa. Publicar un capítulo publica la historia |
| `POST /me/stories/:slug/chapters/:id/unpublish` | Lo devuelve a borrador |
| `PUT /me/stories/:slug/chapters/order` | Reordena: `ids` con todos los capítulos en el orden nuevo |
| `PUT` / `DELETE /stories/:slug/chapters/:n/vote` | Vota o quita el voto |
| `GET /me/library` | Tu repisa |
| `PUT /me/library/:slug` | Guarda la historia o actualiza el capítulo por el que vas |
| `DELETE /me/library/:slug` | La quita de la repisa |

## Base de datos

- El esquema vive en `src/db/schema.ts`. Tablas: `profiles`, `stories`, `chapters`, `tags`, `story_tags`, `library`, `votes`.
- Etiquetas: cada historia guarda las suyas como texto (para mostrarlas sin joins) y además en `tags` + `story_tags`,
  que es por donde se filtra y se autocompleta. Las dos copias se escriben juntas en `src/stories/tagging.ts`.
  `stories.search_text` (título, gancho y etiquetas, sin tildes) tiene un índice GIN para la búsqueda de texto.
- Para cambiarlo: edita el esquema, corre `npm run db:generate` (crea un SQL en `drizzle/`) y luego `npm run db:migrate`.
- Las migraciones se versionan en el repositorio; no se editan tablas a mano en el panel de Supabase.
- El contenido de los capítulos es JSON por bloques (`Block`), el mismo formato del frontend. Un párrafo guarda su
  texto plano y, aparte, el formato (`marks`: negrita, cursiva, subrayado; `align`).

## Imágenes

- Las imágenes **pasan por la API**: se revisa el contenido real del archivo (no la extensión), se endereza,
  se recorta a la medida, se convierte a WebP y se le quitan los metadatos (las fotos de celular traen la
  ubicación GPS). Cada subida usa un nombre nuevo y la imagen anterior se borra.
- El almacenamiento es **compatible con S3**: hoy Supabase Storage, mañana Cloudflare R2 cambiando solo las
  variables `STORAGE_*`.

Configurar Supabase Storage:

1. Supabase → **Storage** → **New bucket**. Nombre: `perfiles`. Activa **Public bucket** (las fotos de perfil
   son públicas). En las opciones, limita el tamaño a 2 MB y los tipos a `image/webp`.
2. Supabase → **Storage** → **S3 Configuration**: copia el **Endpoint** y la **Region** a `STORAGE_ENDPOINT`
   y `STORAGE_REGION`.
3. En esa misma pantalla, **New access key**: copia el *Access key ID* y el *Secret access key* a
   `STORAGE_ACCESS_KEY_ID` y `STORAGE_SECRET_ACCESS_KEY`. Son secretas: solo van en el `.env` de la API
   (y en el panel de Render), nunca en el frontend.
4. `STORAGE_PUBLIC_URL=https://<ref>.supabase.co/storage/v1/object/public/perfiles`.

## Pruebas

```bash
npm run test:e2e
```

Corren contra un Postgres en memoria (PGlite) con las mismas migraciones, así que no necesitan Supabase ni internet.

## Pendiente

Comentarios, seguir autores, notificaciones, importación de .docx, sinónimos de etiquetas, reportes y moderación.
