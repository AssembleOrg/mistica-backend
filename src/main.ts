import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { envConfig } from './config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
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
bootstrap();
