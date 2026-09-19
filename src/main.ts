import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { envConfig } from './config/env.config';

async function bootstrap() {
  // `bodyParser: false` + registro manual, a propósito. Nest registra su parser
  // global sólo si NO encuentra ya un layer llamado `jsonParser` en el stack
  // (express-adapter: `registerParserMiddleware` filtra por `isMiddlewareApplied`).
  // Como abajo montamos un `json()` para el comprobante huérfano —y `json()` se
  // llama `jsonParser` aunque esté scopeado a una ruta— Nest daba por hecho que
  // ya había parser y NO registraba el global: `req.body` llegaba `undefined` en
  // todas las demás rutas. Registrándolos acá el orden es explícito.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // El comprobante huérfano llega como imagen base64 (~hasta 8 MB de imagen ⇒
  // ~11 MB de JSON): subimos el límite de body SOLO para esa ruta; el resto
  // conserva el default de Express (100 kb). Va PRIMERO: el parser global de
  // abajo ve el body ya parseado y no lo vuelve a leer.
  app.use('/api/leads/orphan-receipt', json({ limit: '12mb' }));
  // Adjuntos de la charla (imágenes/documentos que manda el cliente): base64,
  // hasta ~20 MB de binario ⇒ ~28 MB de JSON. Sólo para esa ruta.
  app.use('/api/conversations/media', json({ limit: '28mb' }));
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Global error handling
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // CORS — Cuando el frontend pega al backend via private network Railway,
  // las llamadas server-to-server (Route Handler de Next) no usan CORS, así
  // que no necesitan estar en este whitelist. CORS sólo aplica cuando algún
  // browser pega directo al backend (poco usual, pero lo soportamos via
  // `CORS_ORIGIN` env var).
  //
  // En dev (sin CORS_ORIGIN o NODE_ENV !== 'production'): permitimos cualquier
  // origen. En prod: lista cerrada desde CORS_ORIGIN (coma-separada).
  const isProd = process.env.NODE_ENV === 'production';
  const corsOriginEnv = process.env.CORS_ORIGIN?.trim();
  let corsOrigin: boolean | string[];
  if (!isProd) {
    corsOrigin = true;
  } else if (corsOriginEnv && corsOriginEnv.length > 0) {
    corsOrigin = corsOriginEnv
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  } else {
    // Fallback histórico: dominio público actual del frontend. Reemplazar
    // con `CORS_ORIGIN` en Railway cuando esté disponible.
    corsOrigin = ['https://frontend-mistica-production.up.railway.app'];
  }
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Swagger configuration (only in development)
  if (envConfig.swagger.enabled) {
    const config = new DocumentBuilder()
      .setTitle('Mistica Autentica API')
      .setDescription('API para la gestión del café bar Mistica Autentica')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Autenticación', 'Endpoints para autenticación de usuarios')
      .addTag('Empleados', 'Gestión de empleados del café')
      .addTag('Usuarios', 'Gestión de usuarios del sistema')
      .addTag('Productos', 'Gestión de productos del café')
      .addTag('Ventas', 'Gestión de ventas del café')
      .addTag('Clientes', 'Gestión de clientes del café')
      .addTag('Prepaids', 'Gestión de prepaids de clientes')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const port = envConfig.app.port;
  await app.listen(port);

  console.log(`🚀 Aplicación ejecutándose en el puerto ${port}`);
  if (envConfig.swagger.enabled) {
    console.log(
      `📚 Documentación Swagger disponible en http://localhost:${port}/api`,
    );
  }
}

bootstrap().catch((error) => {
  console.error('Error starting application:', error);
  process.exit(1);
});
