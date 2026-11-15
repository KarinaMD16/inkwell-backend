import { NestFactory } from '@nestjs/core';
import { ENV, type Env } from './config/env.js';

// Carga .env en desarrollo. En Render las variables vienen del panel y no hay archivo.
try {
  process.loadEnvFile('.env');
} catch {
  /* sin archivo .env: se usan las variables del entorno */
}

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  console.log(`Inkwell API escuchando en http://localhost:${env.PORT}`);
}
await bootstrap();
