import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Tamaño máximo de un cuerpo JSON. Un capítulo largo (o una historia tipo chat) pasa fácil los 100 KB
 * que acepta Express por defecto, y el guardado fallaría. 2 MB alcanzan para cientos de miles de palabras.
 * Se usa en main.ts y en las pruebas, para que prueben lo mismo que corre.
 */
export function configureBody(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: '2mb' });
}
