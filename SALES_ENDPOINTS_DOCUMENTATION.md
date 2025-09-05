# Mistica Autentica API Endpoints Documentation

## 📋 **Overview**
API completa para la gestión del café bar Mistica Autentica. Incluye gestión de ventas, clientes, prepaids, productos, empleados y usuarios.

## 🔗 **Base URL**
```
http://localhost:3000/api
```

## 🔐 **Authentication**
Todos los endpoints requieren autenticación JWT Bearer Token.

---

## 👥 **Client Endpoints**

### **1. Crear Cliente**
```http
POST /api/clients
```

**Request Body:**
```json
{
  "fullName": "Juan Pérez",
  "phone": "+54 11 1234-5678",
  "email": "juan@email.com",
  "notes": "Cliente VIP",
  "cuit": "20-12345678-9",
  "prepaids": [
    {
      "amount": 1000.00,
      "notes": "Adelanto para consumo"
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Cliente creado exitosamente",
  "data": {
    "id": "64a1b2c3d4e5f6789012348",
    "fullName": "Juan Pérez",
    "phone": "+54 11 1234-5678",
    "email": "juan@email.com",
    "notes": "Cliente VIP",
    "cuit": "20-12345678-9",
    "prepaid": 1000.00,
    "createdAt": "2025-08-26T04:21:30.000Z",
    "updatedAt": "2025-08-26T04:21:30.000Z",
    "prepaids": [
      {
        "id": "64a1b2c3d4e5f6789012349",
        "clientId": "64a1b2c3d4e5f6789012348",
        "amount": 1000.00,
        "status": "PENDING",
        "notes": "Adelanto para consumo",
        "createdAt": "2025-08-26T04:21:30.000Z",
        "updatedAt": "2025-08-26T04:21:30.000Z"
      }
    ]
  }
}
```

### **2. Obtener Todos los Clientes (Paginado)**
```http
GET /api/clients/paginated?page=1&limit=10&search=Juan
```

**Query Parameters:**
- `page` (optional): Número de página (default: 1)
- `limit` (optional): Elementos por página (default: 10)
- `search` (optional): Término de búsqueda para filtrar por nombre, email, teléfono o CUIT

**Response (200):**
```json
{
  "success": true,
  "message": "Clientes obtenidos exitosamente",
  "data": [
    {
      "id": "64a1b2c3d4e5f6789012348",
      "fullName": "Juan Pérez",
      "phone": "+54 11 1234-5678",
      "email": "juan@email.com",
      "notes": "Cliente VIP",
      "cuit": "20-12345678-9",
      "prepaid": 1000.00,
      "createdAt": "2025-08-26T04:21:30.000Z",
      "updatedAt": "2025-08-26T04:21:30.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### **3. Obtener Todos los Clientes (Sin Paginación)**
```http
GET /api/clients/all?search=Juan
```

**Query Parameters:**
- `search` (optional): Término de búsqueda para filtrar por nombre, email, teléfono o CUIT

### **4. Obtener Cliente por ID**
```http
GET /api/clients/{id}
```

### **5. Obtener Prepaids del Cliente**
```http
GET /api/clients/{id}/prepaids
```

### **6. Obtener Prepaids Pendientes del Cliente**
```http
GET /api/clients/{id}/prepaids/pending
```

### **7. Actualizar Cliente**
```http
PATCH /api/clients/{id}
```

**Request Body:**
```json
{
  "fullName": "Juan Carlos Pérez",
  "phone": "+54 11 1234-5679",
  "email": "juan.carlos@email.com",
  "notes": "Cliente VIP actualizado",
  "prepaids": [
    {
      "amount": 1500.00,
      "notes": "Nuevo adelanto"
    },
    {
      "amount": 500.00,
      "notes": "Adelanto adicional"
    }
  ]
}
```

### **8. Eliminar Cliente (Soft Delete)**
```http
DELETE /api/clients/{id}
```

---

## 💰 **Prepaid Endpoints**

### **1. Crear Prepaid para Cliente**
```http
POST /api/prepaids/{clientId}
```

**Request Body:**
```json
{
  "amount": 500.00,
  "notes": "Adelanto para consumo"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Prepaid creado exitosamente",
  "data": {
    "id": "64a1b2c3d4e5f6789012349",
    "clientId": "64a1b2c3d4e5f6789012348",
    "amount": 500.00,
    "status": "PENDING",
    "notes": "Adelanto para consumo",
    "createdAt": "2025-08-26T04:21:30.000Z",
    "updatedAt": "2025-08-26T04:21:30.000Z"
  }
}
```

### **2. Obtener Todos los Prepaids (Paginado)**
```http
GET /api/prepaids/paginated?page=1&limit=10&status=PENDING
```

**Query Parameters:**
- `page` (optional): Número de página (default: 1)
- `limit` (optional): Elementos por página (default: 10)
- `status` (optional): Filtrar por status (PENDING o CONSUMED)

### **3. Obtener Todos los Prepaids (Sin Paginación)**
```http
GET /api/prepaids/all
```

### **4. Obtener Prepaids por Status (Paginado)**
```http
GET /api/prepaids/status?status=PENDING&page=1&limit=10
```

**Query Parameters:**
- `status` (required): Status del prepaid (PENDING o CONSUMED)
- `page` (optional): Número de página (default: 1)
- `limit` (optional): Elementos por página (default: 10)

**Response (200):**
```json
{
  "success": true,
  "message": "Prepaids filtrados por status obtenidos exitosamente",
  "data": [
    {
      "id": "64a1b2c3d4e5f6789012349",
      "clientId": "64a1b2c3d4e5f6789012348",
      "amount": 500.00,
      "status": "PENDING",
      "notes": "Adelanto para consumo",
      "createdAt": "2025-08-26T04:21:30.000Z",
      "updatedAt": "2025-08-26T04:21:30.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### **5. Obtener Prepaid por ID**
```http
GET /api/prepaids/{id}
```

### **6. Obtener Prepaids de un Cliente**
```http
GET /api/prepaids/client/{clientId}
```

### **7. Obtener Prepaids Pendientes de un Cliente**
```http
GET /api/prepaids/client/{clientId}/pending
```

### **8. Obtener Monto Total de Prepaids Pendientes**
```http
GET /api/prepaids/client/{clientId}/total
```

**Response (200):**
```json
{
  "success": true,
  "message": "Monto total obtenido exitosamente",
  "data": {
    "total": 1500.00
  }
}
```

---

## 📊 **Sales Endpoints**

### **1. Crear Venta**
```http
POST /api/sales
```

**Request Body (Venta con Cliente):**
```json
{
  "clientId": "68ba60de888b3960426b7e74",
  "customerName": "carolina gomez",
  "customerEmail": "merygarcia@mery.com",
  "items": [
    {
      "productId": "68b1d624b83e0ed0d8374af6",
      "quantity": 2,
      "unitPrice": 7000
    }
  ],
  "paymentMethod": "CASH",
  "prepaidId": "68ba80bd888b3960426b7f55",
  "consumedPrepaid": true
}
```

**Request Body (Venta sin Cliente):**
```json
{
  "items": [
    {
      "productId": "68b1d624b83e0ed0d8374af6",
      "quantity": 2,
      "unitPrice": 7000
    }
  ],
  "paymentMethod": "CASH"
}
```

**Campos Opcionales:**
- `clientId` (optional): ID del cliente registrado
- `customerName` (optional): Nombre del cliente
- `customerEmail` (optional): Email del cliente
- `customerPhone` (optional): Teléfono del cliente
- `prepaidId` (optional): ID del prepaid específico a consumir
- `consumedPrepaid` (optional): Indica si se debe consumir el prepaid (default: false)
- `notes` (optional): Notas adicionales

**Nota:** Los prepaids solo se pueden consumir si se proporciona un `clientId` válido.

**Campos de Prepaid en la Respuesta:**
- `prepaidId`: ID del prepaid consumido (solo aparece si se consumió un prepaid)
- `discount`: Monto total del prepaid consumido aplicado como descuento
- `total`: Monto final después de aplicar el descuento del prepaid

**Ejemplos de Uso:**

**1. Venta con cliente y consumo específico de prepaid:**
```json
{
  "clientId": "68ba60de888b3960426b7e74",
  "customerName": "carolina gomez",
  "customerEmail": "merygarcia@mery.com",
  "items": [{"productId": "68b1d624b83e0ed0d8374af6", "quantity": 2, "unitPrice": 7000}],
  "paymentMethod": "CASH",
  "prepaidId": "68ba80bd888b3960426b7f55",
  "consumedPrepaid": true
}
```

**2. Venta con cliente sin consumo de prepaid:**
```json
{
  "clientId": "68ba60de888b3960426b7e74",
  "customerName": "carolina gomez",
  "customerEmail": "merygarcia@mery.com",
  "items": [{"productId": "68b1d624b83e0ed0d8374af6", "quantity": 2, "unitPrice": 7000}],
  "paymentMethod": "CASH",
  "consumedPrepaid": false
}
```

**3. Venta con cliente y consumo automático:**
```json
{
  "clientId": "68ba60de888b3960426b7e74",
  "customerName": "carolina gomez",
  "customerEmail": "merygarcia@mery.com",
  "items": [{"productId": "68b1d624b83e0ed0d8374af6", "quantity": 2, "unitPrice": 7000}],
  "paymentMethod": "CASH"
}
```

**4. Venta sin cliente (cliente anónimo):**
```json
{
  "items": [{"productId": "68b1d624b83e0ed0d8374af6", "quantity": 2, "unitPrice": 7000}],
  "paymentMethod": "CASH"
}
```

**5. Venta sin cliente con datos básicos:**
```json
{
  "customerName": "Cliente Anónimo",
  "items": [{"productId": "68b1d624b83e0ed0d8374af6", "quantity": 2, "unitPrice": 7000}],
  "paymentMethod": "CASH"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Venta creada exitosamente",
  "data": {
    "id": "64a1b2c3d4e5f6789012347",
    "saleNumber": "V-2025-001",
    "clientId": "64a1b2c3d4e5f6789012348",
    "customerName": "Juan Pérez",
    "customerEmail": "juan@email.com",
    "customerPhone": "+54 11 1234-5678",
    "items": [
      {
        "productId": "64a1b2c3d4e5f6789012345",
        "productName": "Café Premium",
        "quantity": 2,
        "unitPrice": 150.50,
        "subtotal": 301.00
      },
      {
        "productId": "64a1b2c3d4e5f6789012346",
        "productName": "Torta de Chocolate",
        "quantity": 1,
        "unitPrice": 200.00,
        "subtotal": 200.00
      }
    ],
    "subtotal": 501.00,
    "tax": 0.00,
    "discount": 5000.00,
    "prepaidId": "68ba80bd888b3960426b7f55",
    "total": 501.00,
    "paymentMethod": "CASH",
    "status": "COMPLETED",
    "notes": "Venta especial para cliente VIP",
    "createdAt": "2025-08-26T04:21:30.000Z",
    "updatedAt": "2025-08-26T04:21:30.000Z"
  }
}
```

### **2. Obtener Todas las Ventas (Paginado)**
```http
GET /api/sales/paginated?page=1&limit=10
```

**Query Parameters:**
- `page` (optional): Número de página (default: 1)
- `limit` (optional): Elementos por página (default: 10)

**Response (200):**
```json
{
  "success": true,
  "message": "Ventas obtenidas exitosamente",
  "data": [
    {
      "id": "64a1b2c3d4e5f6789012347",
      "saleNumber": "V-2025-001",
      "customerName": "Juan Pérez",
      "customerEmail": "juan@email.com",
      "customerPhone": "+54 11 1234-5678",
      "items": [
        {
          "productId": "64a1b2c3d4e5f6789012345",
          "productName": "Café Premium",
          "quantity": 2,
          "unitPrice": 150.50,
          "subtotal": 301.00
        }
      ],
      "subtotal": 501.00,
      "tax": 0.00,
      "discount": 0.00,
      "total": 501.00,
      "paymentMethod": "CASH",
      "status": "COMPLETED",
      "notes": "Venta especial para cliente VIP",
      "createdAt": "2025-08-26T04:21:30.000Z",
      "updatedAt": "2025-08-26T04:21:30.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### **3. Obtener Todas las Ventas (Sin Paginación)**
```http
GET /api/sales/all
```

**Response (200):**
```json
{
  "success": true,
  "message": "Ventas obtenidas exitosamente",
  "data": [
    {
      "id": "64a1b2c3d4e5f6789012347",
      "saleNumber": "V-2025-001",
      "customerName": "Juan Pérez",
      "customerEmail": "juan@email.com",
      "customerPhone": "+54 11 1234-5678",
      "items": [
        {
          "productId": "64a1b2c3d4e5f6789012345",
          "productName": "Café Premium",
          "quantity": 2,
          "unitPrice": 150.50,
          "subtotal": 301.00
        }
      ],
      "subtotal": 501.00,
      "tax": 0.00,
      "discount": 0.00,
      "total": 501.00,
      "paymentMethod": "CASH",
      "status": "COMPLETED",
      "notes": "Venta especial para cliente VIP",
      "createdAt": "2025-08-26T04:21:30.000Z",
      "updatedAt": "2025-08-26T04:21:30.000Z"
    }
  ]
}
```

### **4. Obtener Venta por ID**
```http
GET /api/sales/{id}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Venta obtenida exitosamente",
  "data": {
    "id": "64a1b2c3d4e5f6789012347",
    "saleNumber": "V-2025-001",
    "clientId": "64a1b2c3d4e5f6789012348",
    "customerName": "Juan Pérez",
    "customerEmail": "juan@email.com",
    "customerPhone": "+54 11 1234-5678",
    "items": [
      {
        "productId": "64a1b2c3d4e5f6789012345",
        "productName": "Café Premium",
        "quantity": 2,
        "unitPrice": 150.50,
        "subtotal": 301.00
      }
    ],
    "subtotal": 501.00,
    "tax": 0.00,
    "discount": 5000.00,
    "prepaidId": "68ba80bd888b3960426b7f55",
    "total": 501.00,
    "paymentMethod": "CASH",
    "status": "COMPLETED",
    "notes": "Venta especial para cliente VIP",
    "createdAt": "2025-08-26T04:21:30.000Z",
    "updatedAt": "2025-08-26T04:21:30.000Z"
  }
}
```

### **5. Actualizar Venta**
```http
PATCH /api/sales/{id}
```

**Request Body:**
```json
{
  "clientId": "64a1b2c3d4e5f6789012348",
  "customerName": "Juan Carlos Pérez",
  "customerEmail": "juan.carlos@email.com",
  "customerPhone": "+54 11 1234-5679",
  "items": [
    {
      "productId": "64a1b2c3d4e5f6789012345",
      "quantity": 3,
      "unitPrice": 150.50
    }
  ],
  "paymentMethod": "CARD",
  "prepaidId": "68ba80bd888b3960426b7f55",
  "consumedPrepaid": true,
  "notes": "Venta actualizada",
  "status": "COMPLETED"
}
```

**Notas sobre Prepaids en Actualizaciones:**
- Si se cambia el `prepaidId`, el prepaid anterior se restaura a estado PENDING
- Si el nuevo `prepaidId` es el mismo que el anterior, no se hace nada (solo se recalculan totales)
- Si se elimina el `prepaidId` (null o vacío), se quita el descuento
- Los totales se recalculan automáticamente considerando el prepaid

**Response (200):**
```json
{
  "success": true,
  "message": "Venta actualizada exitosamente",
  "data": {
    "id": "64a1b2c3d4e5f6789012347",
    "saleNumber": "V-2025-001",
    "customerName": "Juan Carlos Pérez",
    "customerEmail": "juan.carlos@email.com",
    "customerPhone": "+54 11 1234-5679",
    "items": [
      {
        "productId": "64a1b2c3d4e5f6789012345",
        "productName": "Café Premium",
        "quantity": 3,
        "unitPrice": 150.50,
        "subtotal": 451.50
      }
    ],
    "subtotal": 451.50,
    "tax": 0.00,
    "discount": 0.00,
    "total": 451.50,
    "paymentMethod": "CARD",
    "status": "COMPLETED",
    "notes": "Venta actualizada",
    "createdAt": "2025-08-26T04:21:30.000Z",
    "updatedAt": "2025-08-26T04:25:15.000Z"
  }
}
```

### **6. Eliminar Venta (Soft Delete)**
```http
DELETE /api/sales/{id}
```

**Funcionalidades al Eliminar:**
- Restaura el stock de productos
- Si la venta tenía un prepaid, lo restaura a estado PENDING
- Realiza soft delete (marca como eliminada)

**Response (200):**
```json
{
  "success": true,
  "message": "Venta eliminada exitosamente"
}
```

### **7. Obtener Ventas del Día**
```http
GET /api/sales/daily
```

**Query Parameters:**
- `date` (optional): Fecha en formato YYYY-MM-DD (default: hoy)
- `timezone` (optional): Zona horaria (default: America/Argentina/Buenos_Aires)

**Response (200):**
```json
{
  "success": true,
  "message": "Ventas del día obtenidas exitosamente",
  "data": {
    "date": "2025-08-26",
    "timezone": "America/Argentina/Buenos_Aires",
    "sales": [
      {
        "id": "64a1b2c3d4e5f6789012347",
        "saleNumber": "V-2025-001",
        "customerName": "Juan Pérez",
        "total": 501.00,
        "paymentMethod": "CASH",
        "status": "COMPLETED",
        "createdAt": "2025-08-26T04:21:30.000Z"
      }
    ],
    "summary": {
      "totalSales": 1,
      "totalAmount": 501.00,
      "totalByPaymentMethod": {
        "CASH": 501.00,
        "CARD": 0.00,
        "TRANSFER": 0.00
      },
      "totalByStatus": {
        "COMPLETED": 1,
        "PENDING": 0,
        "CANCELLED": 0
      }
    }
  }
}
```

---

## 📦 **Product Updates**

### **8. Actualizar Producto (Agregar Special Product)**
```http
PATCH /api/products/{id}
```

**Request Body:**
```json
{
  "specialProduct": true
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Producto actualizado exitosamente",
  "data": {
    "id": "64a1b2c3d4e5f6789012345",
    "name": "Café Premium",
    "barcode": "1234567890123",
    "category": "ORGANICOS",
    "price": 150.50,
    "costPrice": 100.00,
    "stock": 50,
    "unitOfMeasure": "UNIDAD",
    "image": "https://example.com/cafe-premium.jpg",
    "description": "Café premium de alta calidad",
    "status": "ACTIVE",
    "profitMargin": 50.5,
    "specialProduct": true,
    "createdAt": "2025-08-26T04:21:30.000Z",
    "updatedAt": "2025-08-26T04:25:15.000Z"
  }
}
```

---

## 🚨 **Error Responses**

### **400 Bad Request**
```json
{
  "success": false,
  "message": "Datos inválidos",
  "error": "Validation failed",
  "details": [
    {
      "field": "customerName",
      "message": "El nombre del cliente es requerido"
    }
  ]
}
```

### **400 Bad Request - Cliente Ya Registrado**
```json
{
  "success": false,
  "message": "Cliente ya registrado con este email",
  "error": "Bad Request"
}
```

```json
{
  "success": false,
  "message": "Cliente ya registrado con este CUIT",
  "error": "Bad Request"
}
```

### **404 Not Found**
```json
{
  "success": false,
  "message": "Venta no encontrada",
  "error": "Sale not found"
}
```

### **409 Conflict**
```json
{
  "success": false,
  "message": "El número de venta ya existe",
  "error": "Sale number already exists"
}
```

### **500 Internal Server Error**
```json
{
  "success": false,
  "message": "Error interno del servidor",
  "error": "Internal server error"
}
```

---

## 📝 **Data Types**

### **Client**
```typescript
{
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  notes?: string;
  cuit?: string;
  prepaid: number; // Total de prepaids pendientes
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### **Prepaid**
```typescript
{
  id: string;
  clientId: string;
  amount: number;
  status: 'PENDING' | 'CONSUMED';
  notes?: string;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

### **SaleItem**
```typescript
{
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
```

### **PaymentMethod**
```typescript
enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER'
}
```

### **SaleStatus**
```typescript
enum SaleStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}
```

### **PrepaidStatus**
```typescript
enum PrepaidStatus {
  PENDING = 'PENDING',
  CONSUMED = 'CONSUMED'
}
```

---

## 🔧 **Configuration**

### **Timezone Configuration**
- **Default Timezone**: America/Argentina/Buenos_Aires
- **Date Format**: YYYY-MM-DD
- **DateTime Format**: ISO 8601

### **Pagination**
- **Default Page**: 1
- **Default Limit**: 10
- **Max Limit**: 100

---

**Last Updated**: August 26, 2025  
**API Version**: 1.0  
**Status**: ✅ Implemented
