import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { envConfig } from './config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());

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
    corsOrigin = corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean);
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
  app.useGlobalPipes(new ValidationPipe({
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
  }));

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
    console.log(`📚 Documentación Swagger disponible en http://localhost:${port}/api`);
  }
}

bootstrap().catch((error) => {
  console.error('Error starting application:', error);
  process.exit(1);
});
