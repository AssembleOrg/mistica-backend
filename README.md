# Mistica Autentica - Backend API

Backend API para la gestión del café bar Mistica Autentica, construido con NestJS, MongoDB, Mongoose y JWT.

## 🚀 Características

- **Arquitectura Limpia**: Implementación de Clean Architecture con separación clara de responsabilidades
- **Base de Datos**: MongoDB con Mongoose ODM para tipado estricto
- **Autenticación**: JWT con Passport.js
- **Documentación**: Swagger/OpenAPI con descripciones en español
- **Auditoría**: Logging automático de todas las operaciones CRUD
- **Validación**: Validación de datos con class-validator
- **Paginación**: Sistema de paginación estándar para todas las entidades
- **Soft Delete**: Eliminación lógica con timestamps
- **Manejo de Errores**: Excepciones personalizadas en español
- **CORS**: Habilitado para desarrollo frontend

## 🏗️ Estructura del Proyecto

```
src/
├── auth/                 # Autenticación y autorización
├── common/               # Utilidades compartidas
│   ├── decorators/      # Decoradores personalizados
│   ├── dto/            # Data Transfer Objects
│   ├── enums/          # Enumeraciones
│   ├── exceptions/     # Excepciones personalizadas
│   ├── guards/         # Guards de autenticación
│   └── interceptors/   # Interceptores
├── config/              # Configuración de la aplicación
├── employees/           # Gestión de empleados
├── products/            # Gestión de productos
├── database/            # Configuración de base de datos
├── users/               # Gestión de usuarios
└── main.ts              # Punto de entrada
```

## 🛠️ Tecnologías Utilizadas

- **NestJS**: Framework de Node.js para aplicaciones escalables
- **Mongoose**: ODM moderno para MongoDB y Node.js
- **MongoDB**: Base de datos NoSQL
- **JWT**: Autenticación basada en tokens
- **Passport.js**: Estrategias de autenticación
- **Swagger**: Documentación de API
- **class-validator**: Validación de datos
- **bcryptjs**: Hashing de contraseñas

## 📋 Requisitos Previos

- Node.js 18+ 
- pnpm (recomendado) o npm
- MongoDB 5.0+
- Git

## 🚀 Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd mistica-backend
   ```

2. **Instalar dependencias**
   ```bash
   pnpm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env` con tus valores:
   ```env
   DATABASE_URL="mongodb://localhost:27017/mistica_autentica"
   JWT_SECRET="tu_jwt_secret_super_seguro_aqui"
   JWT_EXPIRES_IN="24h"
   NODE_ENV="development"
   PORT=3000
   SWAGGER_ENABLED="true"
   ```

4. **Configurar base de datos**
   ```bash
   # No es necesario para Mongoose
   ```

5. **Ejecutar migraciones (opcional para desarrollo)**
   ```bash
   # No es necesario para Mongoose
   ```

6. **Iniciar la aplicación**
   ```bash
   # Desarrollo
   pnpm start:dev
   
   # Producción
   pnpm build
   pnpm start:prod
   ```

## 📚 Documentación de la API

Una vez iniciada la aplicación, la documentación Swagger estará disponible en:
- **Desarrollo**: http://localhost:3000/api
- **Producción**: Deshabilitado por defecto

## 🔐 Autenticación

La API utiliza JWT (JSON Web Tokens) para autenticación. Para acceder a endpoints protegidos:

1. **Registrar usuario**: `POST /auth/register`
2. **Iniciar sesión**: `POST /auth/login`
3. **Usar token**: Incluir `Authorization: Bearer <token>` en headers

## 👥 Roles y Permisos

### Empleados
- **Cajero**: Gestión de ventas y caja
- **Gerente**: Acceso completo al sistema
- **Mozo**: Gestión de pedidos y mesas

### Usuarios del Sistema
- **Admin**: Acceso completo
- **User**: Acceso limitado

## 🏷️ Categorías de Productos

- **Orgánicos**: Productos orgánicos y naturales
- **Aromáticos**: Tés, cafés y especias
- **Wellness**: Productos de bienestar y salud

## 📊 Estructura de Respuesta

### Respuesta Paginada
```json
{
  "data": "DtoResponse[]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number",
    "hasNextPage": "boolean",
    "hasPreviousPage": "boolean"
  }
}
```

### Respuesta Estándar
```json
{
  "data": "ResponseData",
  "message": "string",
  "success": "boolean",
  "timestamp": "string"
}
```

## 🔍 Endpoints Principales

### Autenticación
- `POST /auth/login` - Iniciar sesión
- `POST /auth/register` - Registrar usuario
- `POST /auth/admin/register` - Registrar administrador

### Empleados
- `GET /employees` - Listar empleados (paginado)
- `GET /employees/all` - Listar todos los empleados
- `GET /employees/:id` - Obtener empleado por ID
- `POST /employees` - Crear empleado
- `PATCH /employees/:id` - Actualizar empleado
- `DELETE /employees/:id` - Eliminar empleado

### Usuarios
- `GET /users` - Listar usuarios (paginado)
- `GET /users/all` - Listar todos los usuarios
- `GET /users/:id` - Obtener usuario por ID
- `POST /users` - Crear usuario
- `PATCH /users/:id` - Actualizar usuario
- `DELETE /users/:id` - Eliminar usuario

### Productos
- `GET /products` - Listar productos (paginado)
- `GET /products/all` - Listar todos los productos
- `GET /products/category/:category` - Productos por categoría
- `GET /products/:id` - Obtener producto por ID
- `POST /products` - Crear producto
- `PATCH /products/:id` - Actualizar producto
- `PATCH /products/:id/stock/add` - Agregar stock
- `PATCH /products/:id/stock/subtract` - Restar stock
- `DELETE /products/:id` - Eliminar producto

## 🧪 Testing

```bash
# Tests unitarios
pnpm test

# Tests e2e
pnpm test:e2e

# Cobertura de tests
pnpm test:cov
```

## 📝 Scripts Disponibles

```bash
pnpm start          # Iniciar aplicación
pnpm start:dev      # Modo desarrollo con hot reload
pnpm start:debug    # Modo debug
pnpm start:prod     # Modo producción
pnpm build          # Construir aplicación
pnpm test           # Ejecutar tests
pnpm test:watch     # Tests en modo watch
pnpm test:e2e       # Tests end-to-end
pnpm lint           # Linting del código
pnpm format         # Formatear código
```

## 🔧 Configuración de Desarrollo

### Variables de Entorno
- `DATABASE_URL`: URL de conexión a MongoDB
- `JWT_SECRET`: Clave secreta para JWT
- `JWT_EXPIRES_IN`: Tiempo de expiración del token
- `NODE_ENV`: Entorno de ejecución
- `PORT`: Puerto de la aplicación
- `SWAGGER_ENABLED`: Habilitar/deshabilitar Swagger

### Base de Datos
La aplicación utiliza MongoDB con Mongoose. Para desarrollo local:
1. Instalar MongoDB
2. Crear base de datos `mistica_autentica`
3. Configurar `DATABASE_URL` en `.env`

## 🚀 Despliegue

### Producción
1. Configurar `NODE_ENV=production`
2. Configurar `SWAGGER_ENABLED=false`
3. Configurar `JWT_SECRET` seguro
4. Configurar `DATABASE_URL` de producción
5. Construir y ejecutar:
   ```bash
   pnpm build
   pnpm start:prod
   ```

### Docker (opcional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start:prod"]
```

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 🆘 Soporte

Para soporte técnico o preguntas:
- Crear un issue en GitHub
- Contactar al equipo de desarrollo

## 🔄 Changelog

### v1.0.0
- Implementación inicial de la API
- Sistema de autenticación JWT
- CRUD completo para empleados, usuarios y productos
- Sistema de auditoría automática
- Documentación Swagger completa
- Validación de datos y manejo de errores
- Paginación estándar para todas las entidades
- Soft delete y timestamps automáticos

---

**Mistica Autentica** - Transformando la experiencia del café con tecnología moderna 🚀☕
