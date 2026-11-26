import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ENV, type Env } from './config/env.js';
import { originChecker } from './common/origins.js';
import { configureBody } from './http.js';

// Carga .env en desarrollo. En Render las variables vienen del panel y no hay archivo.
try {
  process.loadEnvFile('.env');
} catch {
  /* sin archivo .env: se usan las variables del entorno */
}

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<Env>(ENV);
  app.disable('x-powered-by');
  // Detrás del proxy de Render: así el límite de peticiones ve la IP de cada persona, no la del proxy.
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
  app.use(securityHeaders);
  configureBody(app);
  const allowed = originChecker(env);
  app.enableCors({ origin: (origin, done) => done(null, allowed(origin)), credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  console.log(`Inkwell API escuchando en http://localhost:${env.PORT}`);
}

/** Cabeceras de seguridad (regla 14). La API solo devuelve JSON: no carga nada ni se muestra en un iframe. */
function securityHeaders(_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
}

await bootstrap();
