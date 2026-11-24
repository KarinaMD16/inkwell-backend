# Inkwell — Documento de contexto del proyecto

> Archivo de referencia del proyecto. Última actualización: 14 de noviembre de 2026.

## 1. Qué es

**Inkwell** es una plataforma de lectura y escritura de historias, pensada como alternativa a Wattpad. Su propuesta es ser fuerte justo donde Wattpad perdió popularidad: anuncios excesivos y monetización agresiva.

- Forma parte de **Koral Studio**, el pequeño estudio de apps del equipo (junto a CashTrack y Lyric Island). Es el proyecto más "serio" del estudio.
- Estado: idea / planificación del MVP.

**Definición corta:** plataforma de lectura y escritura de historias en español, sin anuncios dentro del texto, con herramientas para escribir formatos que hoy son difíciles en Wattpad (historias tipo redes sociales, fichas de personajes, interludios).

**Descripción corta (Play Store, ≤80 caracteres):**
> Lee y escribe historias sin anuncios en el texto. Fanfics, AU y más.

**Descripción larga (borrador):**
> Inkwell es el lugar para leer y escribir historias en español sin interrupciones. Aquí no hay anuncios en medio de tus capítulos.
>
> Para escritores: importa tu manuscrito en Word y Inkwell detecta tus capítulos automáticamente. Usa plantillas para crear historias con chats y publicaciones de redes sociales, fichas de personajes o interludios, o comparte tus propias plantillas con la comunidad. Corrige tu ortografía mientras escribes.
>
> Para lectores: encuentra exactamente lo que buscas con etiquetas y filtros detallados, y apoya directamente a tus autores favoritos.

## 2. Público meta

- **Principal:** escritoras y escritores hispanohablantes de ~16–25 años que publican fanfic, AU y romance en Wattpad y están cansados de los anuncios y del algoritmo.
- **Secundario:** lectores de ese mismo contenido que buscan lectura limpia y buenos filtros.
- **Más adelante:** autores con audiencia que quieren monetizar con suscripciones (solo mayores de 18).

## 3. Ideas principales (diferenciadores)

1. **Importación fácil** — subir archivos .docx y detectar secciones/capítulos automáticamente, para incentivar a escritores a migrar. También alguna facilidad para traer historias desde Wattpad.
2. **Ayuda con la ortografía** integrada en el editor.
3. **Plantillas + marketplace** — plantillas populares de estructura de capítulo, y que los usuarios creen y publiquen las suyas en un marketplace. Ejemplos:
   - Capítulos de "personajes" con los *faceclaims* de la historia.
   - Capítulos de interludios con estructura propia.
   - Historias tipo redes sociales, donde la inmersión depende de una estructura de "mensajes" y "publicaciones".
4. **Anuncios limitados y no invasivos.**
5. **Suscripción tipo "Patreon integrado"** — micro-suscripciones de lectores a sus autores favoritos para leer capítulos adelantados.
6. **Premium global** — pago mensual único con funciones avanzadas: descarga offline sin límite, personalización de temas, insignias.
7. **Experiencia de lectura limpia** — cero anuncios invasivos en mitad del texto.
8. **Etiquetado y filtros avanzados** estilo AO3.
9. **Conexión con Lyric Island** — moodboards musicales: playlists de Spotify asociadas a la historia y ver letras mientras se lee.
10. **Estilos de título** — el autor elige tipografías y adornos de una lista para los títulos de su historia y de sus capítulos, en lugar de decorarlos con letras Unicode y emojis como se hace en Wattpad (p. ej., "𝓮𝓷𝓮𝓶𝓲𝓮𝓼 𝓽𝓸 𝓵𝓸𝓿𝓮𝓻𝓼 💘"). El título se guarda como texto normal y el estilo se aplica aparte, así sigue siendo buscable y legible para lectores de pantalla. Surgió de la revisión de la interfaz de Wattpad (14 nov. 2026). Pendiente: decidir si entra en el MVP y qué estilos se ofrecen.

## 4. MVP: qué debe llevar

Objetivo: lanzar **app Android + sitio web** en un estado confiable y completo, que dé gusto usar y enganche desde el inicio, **sin pagar infraestructura en los primeros meses**.

### 4.1 Funciones del MVP

**Diferenciadores que entran en el MVP:**

| Función | Alcance en el MVP | Queda para después |
|---|---|---|
| Importación .docx | Subir .docx, detectar capítulos (títulos y patrones como "Capítulo N"), revisar antes de publicar | Importar desde Wattpad (riesgo legal) |
| Plantillas | Plantillas oficiales como bloques del editor: chat/mensajes, post de red social, ficha de personaje/faceclaim, interludio | Plantillas creadas por usuarios y marketplace |
| Etiquetas y filtros estilo AO3 | Fandom, personajes, relaciones, advertencias, clasificación por edad, estado; filtros de incluir/excluir | Sinónimos y etiquetas curadas por la comunidad |
| Lectura sin anuncios en el texto | Ningún anuncio dentro de los capítulos | Anuncios solo fuera del texto, con tope público |
| Ortografía | Corrector nativo del navegador/teclado | LanguageTool autoalojado (cuesta servidor) |
| Moodboard musical | Enlaces o embeds de Spotify/YouTube y botón "Abrir en Lyric Island" | Integración con la API de Spotify (ver 4.4) |

**Funciones base que hacen que la app enganche:**

- **Lectura:** lector cómodo (tamaño de letra, modo oscuro), progreso sincronizado entre web y app, lectura offline básica de la biblioteca.
- **Comunidad:** biblioteca/listas de lectura, seguir autores, votos, comentarios por capítulo y, si se puede, por párrafo (el gran gancho de Wattpad).
- **Notificaciones:** capítulo nuevo, respuestas, nuevos seguidores.
- **Para autores:** borradores, publicación programada, estadísticas básicas (lecturas, votos, comentarios).
- **Descubrimiento:** búsqueda, portada con historias nuevas/populares por etiqueta, onboarding eligiendo fandoms y etiquetas.
- **Seguridad:** reportes, moderación, bloqueo de usuarios, clasificación por edad. El contenido +18 explícito se queda solo en la web (Google Play no lo permite).

**Fuera del MVP:** micro-suscripciones por autor, marketplace de plantillas, Premium completo, otros idiomas.

### 4.2 Arquitectura

- **Base de datos, autenticación y archivos:** Supabase (PostgreSQL). JSONB para capítulos y plantillas; búsqueda de texto completo de Postgres para empezar.
- **API:** NestJS liviano. **Todas las escrituras pasan por la API**: verifica el JWT de Supabase, valida con DTOs (class-validator/zod) y aplica las reglas de negocio. Ahí viven la importación .docx (mammoth), los webhooks de pagos, la moderación y las tareas programadas.
- **RLS como segunda capa:** todo denegado por defecto en Supabase.
- **Esquema y migraciones** con Drizzle, en el repositorio, no a mano en el panel.
- **Web:** Next.js con SSR, para que Google indexe las historias.
- **Android:** React Native con Expo (comparte TypeScript y tipos con la web; SQLite para offline).
- **Capítulos como JSON estructurado** (TipTap/ProseMirror), no HTML: cada plantilla es un bloque propio del editor.
- **Portabilidad:** evitar triggers complejos y lógica en Edge Functions. Si algún día conviene salir de Supabase, se migra con `pg_dump` a cualquier Postgres y los archivos a R2/S3.

### 4.3 Dominios (subdominio de koralstudio.online)

En las primeras etapas Inkwell vive bajo el dominio del estudio, **koralstudio.online**:

| Subdominio | Uso | Dónde |
|---|---|---|
| `inkwell.koralstudio.online` | Sitio web (Next.js) | Netlify o Cloudflare Pages |
| `api-inkwell.koralstudio.online` | API NestJS | Render |
| URL por defecto de Supabase | Base de datos y auth | Supabase (el dominio propio es un extra de pago) |

Pendientes ligados al dominio:
- Páginas de **política de privacidad** y **términos** en `inkwell.koralstudio.online` (Google Play las exige).
- Verificar el dominio en Resend para que los correos de verificación salgan desde @koralstudio.online.
- Configurar las URLs de redirección de Google OAuth y los deep links de la app Android (App Links) con el subdominio.
- Si después se compra un dominio propio para Inkwell, redirigir con 301 desde el subdominio para no perder SEO.

### 4.4 Costo cero en la beta

| Pieza | Opción gratis | Ojo con |
|---|---|---|
| Base, auth y archivos | Supabase Free | Pausa proyectos inactivos (~1 semana) |
| API NestJS | Render Free | Se duerme; el primer request tarda |
| Web Next.js | Netlify o Cloudflare Pages | El plan Hobby de Vercel no permite uso comercial |
| Imágenes | Cloudflare R2 (~10 GB gratis) | Comprimir portadas al subirlas |
| Push | Expo Push / FCM | Gratis |
| Correos | Resend (plan gratis) | Suficiente para verificación de cuenta |
| Ortografía | Corrector nativo | LanguageTool queda para después |

Ya se tiene: dominio koralstudio.online y cuenta de Google Play (si ya está pagada por CashTrack).

**Spotify:** la API ya no es viable para apps nuevas pequeñas (el modo desarrollo permite ~5 usuarios; el acceso ampliado exige empresa registrada y 250.000 usuarios activos mensuales). Por eso en el MVP solo se usan enlaces/embeds.

**Señal para empezar a pagar:** lanzamiento público o acercarse a los límites gratuitos. Primer gasto probable: Supabase Pro (~25 USD/mes) + servidor sin sueño (~7 USD/mes). Se cubre con ~12 personas en el tier "Fundador" a ~3 USD (descontando el 15 % de Google Play).

### 4.5 Monetización temprana

- **Tier "Fundador"** barato: insignia, temas, acceso anticipado. Android con Google Play Billing (15 % en suscripciones); web con un merchant of record (Paddle o Lemon Squeezy; Stripe no opera directamente en Costa Rica, confirmar).
- **Anuncios** solo entre capítulos o en el feed, nunca en el texto. Con poco tráfico generan poco.
- **Apoyo al equipo** con Ko-fi o un Patreon de Koral Studio.
- **Pagos directos a autores** hasta tener 500–1.000 autores activos (implican transferencias, impuestos y verificación de identidad).

## 5. Conclusiones del estudio de mercado (4 nov. 2026)

- **Veredicto:** viable como plataforma de nicho con comunidad fuerte, no como reemplazo inmediato de Wattpad. Apertura del mercado: **6/10** (hay hueco de producto; el reto es distribución).
- **Contexto:** Wattpad viene perdiendo usuarios (2025–2026) y las quejas se centran en anuncios, presión para pagar Premium y moderación. Radish (Kakao) y Kindle Vella (Amazon) cerraron por cobrar sin tener comunidad.
- **Hueco:** nadie combina comunidad social tipo Wattpad + etiquetado tipo AO3 + monetización directa al autor tipo Ream/Patreon, sobre todo en español (segundo idioma de Wattpad).
- **Diferenciadores más fuertes:** plantillas con marketplace (el más original) e importación .docx.
- **Riesgos:** arranque en frío (efecto red), moderación con público mayoritariamente menor, pagos con menores, contenido generado con IA, plagio.
- **Importar desde Wattpad:** riesgo legal (probablemente viola sus términos). Alternativa segura: el autor importa sus propios archivos; cualquier importador por enlace requiere verificación de autoría y asesoría legal.
- **Monetización:** el Premium global es el motor de ingresos; las micro-suscripciones sirven para retener autores (comisión baja, 5–10 %, priorizar pagos web). Precio regional en LATAM. Si hay anuncios, solo fuera del texto y con tope público.
- **Estrategia por fases:**
  1. Validar — entrevistas a ~20 autores hispanos; prototipo del editor con 3 plantillas. *Condición:* autores piden acceso.
  2. MVP en español — importación .docx, plantillas, etiquetas, ortografía, lectura sin anuncios, 100–300 autores semilla. *Condición:* 500–1.000 autores activos.
  3. Monetizar — Premium global con precio regional; micro-suscripciones solo +18. *Condición:* ingresos cubren costos.
  4. Escalar — marketplace de plantillas de pago, app móvil completa, otros idiomas.

## 6. Nombre

- Elegido: **Inkwell** (nov. 2026).
- Nota: el nombre está concurrido (varias apps "Inkwell" de escritura/lectura, y el prefijo "Ink-" lo usan Inkitt e Inkspired). Recomendación: usar un apellido en tiendas (p. ej., "Inkwell: Historias y Fanfics"), revisar registro de marca y asegurar dominio y redes.
