# API Context Documentation - Mistica Autentica

## 📋 Información General

**Base URL**: `http://localhost:3000` (desarrollo)  
**Versión**: 1.0  
**Formato de Respuesta**: JSON  
**Autenticación**: JWT Bearer Token  
**Documentación Swagger**: `/api` (solo en desarrollo)

## 🔐 Autenticación

### Headers Requeridos
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Estructura del Token JWT
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "admin|user",
  "iat": 1234567890,
  "exp": 1234567890
}
```

## 📊 Estructura de Respuestas

### Respuesta Estándar
```json
{
  "data": "ResponseData",
  "message": "Operación exitosa",
  "success": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Respuesta Paginada
```json
{
  "data": "DtoResponse[]",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Respuesta de Error
```json
{
  "statusCode": 400,
  "message": "Mensaje de error en español",
  "error": "Bad Request",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔍 Endpoints de Autenticación

### POST /auth/login
**Descripción**: Iniciar sesión de usuario  
**Público**: ✅ Sí  
**Body**:
```json
{
  "email": "string",
  "password": "string"
}
```
**Respuesta Exitosa** (200):
```json
{
  "access_token": "jwt_token_string",
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "admin|user"
  }
}
```
**Errores**:
- `401`: Credenciales inválidas
- `400`: Datos inválidos

### POST /auth/register
**Descripción**: Registrar nuevo usuario  
**Público**: ✅ Sí  
**Body**:
```json
{
  "email": "string",
  "name": "string",
  "password": "string",
  "role": "admin|user",
  "avatar": "string (opcional)"
}
```
**Respuesta Exitosa** (201):
```json
{
  "id": "string",
  "email": "string",
  "name": "string",
  "role": "admin|user",
  "avatar": "string|null",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```
**Errores**:
- `400`: Datos inválidos
- `409`: Email ya registrado

### POST /auth/admin/register
**Descripción**: Registrar nuevo usuario administrador  
**Público**: ❌ No (requiere JWT)  
**Body**: Igual que `/auth/register`  
**Respuesta**: Igual que `/auth/register`  
**Errores**: Igual que `/auth/register` + `401` si no está autenticado

## 👥 Endpoints de Empleados

### GET /employees
**Descripción**: Listar empleados con paginación  
**Público**: ❌ No  
**Query Parameters**:
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Elementos por página (default: 10)

**Respuesta Exitosa** (200):
```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "email": "string",
      "role": "cajero|gerente|mozo",
      "phone": "string|null",
      "address": "string|null",
      "startDate": "Date",
      "createdAt": "Date",
      "updatedAt": "Date"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### GET /employees/all
**Descripción**: Listar todos los empleados sin paginación  
**Público**: ❌ No  
**Respuesta**: Array de empleados sin metadatos de paginación

### GET /employees/:id
**Descripción**: Obtener empleado por ID  
**Público**: ❌ No  
**Path Parameters**:
- `id`: ID del empleado

**Respuesta Exitosa** (200):
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "cajero|gerente|mozo",
  "phone": "string|null",
  "address": "string|null",
  "startDate": "Date",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```
**Errores**:
- `404`: Empleado no encontrado

### POST /employees
**Descripción**: Crear nuevo empleado  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (CREATE)  
**Body**:
```json
{
  "name": "string",
  "email": "string",
  "role": "cajero|gerente|mozo",
  "phone": "string (opcional)",
  "address": "string (opcional)",
  "startDate": "Date (ISO string)"
}
```
**Respuesta Exitosa** (201): Empleado creado  
**Errores**:
- `400`: Datos inválidos
- `409`: Email ya registrado

### PATCH /employees/:id
**Descripción**: Actualizar empleado  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (UPDATE)  
**Path Parameters**:
- `id`: ID del empleado

**Body**: Campos opcionales a actualizar  
**Respuesta Exitosa** (200): Empleado actualizado  
**Errores**:
- `400`: Datos inválidos
- `404`: Empleado no encontrado
- `409`: Email ya registrado

### DELETE /employees/:id
**Descripción**: Eliminar empleado (soft delete)  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (DELETE)  
**Path Parameters**:
- `id`: ID del empleado

**Respuesta Exitosa** (200): Sin contenido  
**Errores**:
- `404`: Empleado no encontrado

## 👤 Endpoints de Usuarios

### GET /users
**Descripción**: Listar usuarios con paginación  
**Público**: ❌ No  
**Query Parameters**: Igual que empleados  
**Respuesta**: Similar a empleados pero sin password  
**Errores**: Igual que empleados

### GET /users/all
**Descripción**: Listar todos los usuarios sin paginación  
**Público**: ❌ No  
**Respuesta**: Array de usuarios sin metadatos de paginación

### GET /users/:id
**Descripción**: Obtener usuario por ID  
**Público**: ❌ No  
**Respuesta**: Usuario sin password  
**Errores**: Igual que empleados

### POST /users
**Descripción**: Crear nuevo usuario  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (CREATE)  
**Body**: Igual que `/auth/register`  
**Respuesta**: Usuario creado sin password  
**Errores**: Igual que empleados

### PATCH /users/:id
**Descripción**: Actualizar usuario  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (UPDATE)  
**Body**: Campos opcionales a actualizar  
**Respuesta**: Usuario actualizado sin password  
**Errores**: Igual que empleados

### DELETE /users/:id
**Descripción**: Eliminar usuario (soft delete)  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (DELETE)  
**Respuesta**: Sin contenido  
**Errores**: Igual que empleados

## 🏷️ Endpoints de Productos

### GET /products
**Descripción**: Listar productos con paginación  
**Público**: ❌ No  
**Query Parameters**: Igual que empleados  
**Respuesta**: Similar a empleados pero con campos de producto  
**Errores**: Igual que empleados

### GET /products/all
**Descripción**: Listar todos los productos sin paginación  
**Público**: ❌ No  
**Respuesta**: Array de productos sin metadatos de paginación

### GET /products/category/:category
**Descripción**: Listar productos por categoría con paginación  
**Público**: ❌ No  
**Path Parameters**:
- `category`: `organicos|aromaticos|wellness`

**Query Parameters**: Igual que empleados  
**Respuesta**: Productos filtrados por categoría con paginación

### GET /products/:id
**Descripción**: Obtener producto por ID  
**Público**: ❌ No  
**Respuesta**: Producto completo  
**Errores**: Igual que empleados

### POST /products
**Descripción**: Crear nuevo producto  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (CREATE)  
**Body**:
```json
{
  "name": "string",
  "barcode": "string",
  "category": "organicos|aromaticos|wellness",
  "price": "number",
  "costPrice": "number",
  "stock": "number",
  "unitOfMeasure": "litro|gramo",
  "image": "string (URL)",
  "description": "string",
  "status": "active|inactive|out_of_stock"
}
```
**Respuesta Exitosa** (201): Producto creado con profitMargin calculado  
**Errores**:
- `400`: Datos inválidos o precio inválido
- `409`: Código de barras ya registrado

### PATCH /products/:id
**Descripción**: Actualizar producto  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (UPDATE)  
**Body**: Campos opcionales a actualizar  
**Respuesta**: Producto actualizado  
**Errores**: Igual que empleados + lógica de negocio

### PATCH /products/:id/stock/add
**Descripción**: Agregar stock al producto  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (UPDATE_STOCK)  
**Body**:
```json
{
  "quantity": "number"
}
```
**Respuesta**: Producto con stock actualizado  
**Errores**:
- `400`: Cantidad inválida
- `404`: Producto no encontrado

### PATCH /products/:id/stock/subtract
**Descripción**: Restar stock del producto  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (UPDATE_STOCK)  
**Body**: Igual que agregar stock  
**Respuesta**: Producto con stock actualizado  
**Errores**:
- `400`: Stock insuficiente o cantidad inválida
- `404`: Producto no encontrado

### DELETE /products/:id
**Descripción**: Eliminar producto (soft delete)  
**Público**: ❌ No  
**Auditoría**: ✅ Sí (DELETE)  
**Respuesta**: Sin contenido  
**Errores**: Igual que empleados

## 🔍 Códigos de Estado HTTP

| Código | Descripción | Uso |
|--------|-------------|-----|
| 200 | OK | Operación exitosa |
| 201 | Created | Recurso creado exitosamente |
| 400 | Bad Request | Datos inválidos o lógica de negocio fallida |
| 401 | Unauthorized | No autenticado o token inválido |
| 403 | Forbidden | No autorizado para la operación |
| 404 | Not Found | Recurso no encontrado |
| 409 | Conflict | Conflicto (email duplicado, código de barras duplicado) |
| 500 | Internal Server Error | Error interno del servidor |

## 📝 Notas de Auditoría

Todos los endpoints marcados con "Auditoría: ✅ Sí" registran automáticamente:
- Entidad afectada
- ID de la entidad
- Acción realizada
- Usuario que realizó la acción
- IP del usuario
- Valores anteriores y nuevos (cuando aplica)
- Timestamp de la operación

## 🚀 Ejemplos de Uso

### Flujo de Autenticación
```bash
# 1. Registrar usuario
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mistica.com","name":"Admin","password":"123456","role":"admin"}'

# 2. Iniciar sesión
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mistica.com","password":"123456"}'

# 3. Usar token para operaciones protegidas
curl -X GET http://localhost:3000/employees \
  -H "Authorization: Bearer <token_from_step_2>"
```

### Crear Producto
```bash
curl -X POST http://localhost:3000/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Café Orgánico Premium",
    "barcode": "1234567890123",
    "category": "organicos",
    "price": 15.99,
    "costPrice": 8.50,
    "stock": 100,
    "unitOfMeasure": "gramo",
    "image": "https://example.com/cafe.jpg",
    "description": "Café orgánico de alta calidad",
    "status": "active"
  }'
```

## 🔧 Configuración de Desarrollo

### Variables de Entorno
```env
DATABASE_URL="mongodb://localhost:27017/mistica_autentica"
JWT_SECRET="tu_jwt_secret_super_seguro_aqui"
JWT_EXPIRES_IN="24h"
NODE_ENV="development"
PORT=3000
SWAGGER_ENABLED="true"
```

### Base de Datos
```bash
# Conectar a MongoDB
mongosh "mongodb://localhost:27017/mistica_autentica"

# Ver colecciones
show collections

# Ver datos de ejemplo
db.employees.find()
db.users.find()
db.products.find()
db.audit_logs.find()
```

---

**Documentación generada automáticamente**  
**Última actualización**: Enero 2024  
**Versión de la API**: 1.0 