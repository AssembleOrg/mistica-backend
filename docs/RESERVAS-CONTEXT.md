# Reservas de experiencias — contexto de dominio y gaps

> Estado del módulo de reservas (experiencias/turnos/pagos) frente al **negocio
> real** de Mística Auténtica. Lo consume el backend, el frontend (admin + landing)
> y el bot de WhatsApp (`mistica-whatsapp-bot`). Para tono/negocio ver
> `mistica-whatsapp-bot/CONTEXT.md`.

## Modelo actual (implementado)

- **Experience** (`src/common/schemas/experience.schema.ts`): plantilla.
  `name, description, durationMinutes, basePrice (p/persona), defaultCapacity,
  images, isActive`.
- **ExperienceSession** (turno): `experienceId, experienceName, durationMinutes,
  price, startAt, endAt, capacity, seatsTaken, seatsAvailable, status
  (DRAFT/OPEN/CLOSED/CANCELLED), notes`. Cupo atómico por documento.
- **Reservation**: hold público → `PENDING` → confirma por webhook MercadoPago →
  `CONFIRMED`. Código de gestión, idempotencyKey. Source PUBLIC/ADMIN.
- **Pago**: **siempre MercadoPago, monto = `price * quantity` (100%)**. Admin
  puede crear reservas pagadas (efectivo/transferencia/cortesía) que impactan caja.
- **Endpoints públicos** (los consume la web y el bot):
  `GET /experiences/public`, `GET /experience-sessions/public?experienceId=`,
  `POST /reservations/hold`, `GET /reservations/code/:code`,
  `POST /reservations/code/:code/cancel`.

## Realidad del negocio (lo que el modelo NO refleja)

1. **TODA reserva es seña del 50%**, no pago total. El saldo se completa después
   (local; en mensuales antes del día 10). → El hold debe cobrar **50%**, no 100%.
2. **Servicios mensuales/recurrentes** (Taller de cerámica, Escuelita de niños):
   cuota mensual, días fijos semanales, seña 50% + saldo antes del 10, 1ra clase
   gratis, tramos por hermanos, rango de edad. No es "turno único con cupo".
3. **Eventos/Cumpleaños**: precio por persona según experiencia, **beneficios por
   grupo** (lugares bonificados, mini torta, upsell torta $15.000), **recargo de
   tarjeta** (cuotas), **blackout** (20/7–1/8), espacio privado al completar cupo
   (hasta 40). No auto-reservable.
4. **Facilitadores (B2B)**: alquiler de espacio + coffee break, a coordinar.
5. **Tienda**: kits para pintar en casa + productos artesanales (sin e-commerce).
6. **Variantes por experiencia** (cerámica vs. llevar-en-el-día; intervenir pieza
   vs. crear desde cero) y **metadatos de ficha** (qué incluye, tiempo de entrega,
   ventana horaria mar–sáb 15–20) no tienen dónde vivir.
7. **Reserva por fecha-a-pedido**: el negocio ofrece ventanas ("mar a sáb 15–20")
   y consulta disponibilidad sobre la fecha que pide el cliente; el modelo exige
   turnos pre-cargados.

## Qué agregar (propuesta, ordenada por prioridad)

### ✅ P0 — Seña 50% (IMPLEMENTADO 2026-06-29)
- `Experience.depositPct` (default `50`) y `ExperienceSession.depositPct` (copiada
  al generar el turno).
- `createHold`: `total = price*qty`; `deposit = round(total*pct/100)`; la
  **preference de MercadoPago cobra el `deposit`** (ítem único "Seña"); guarda
  `amount = deposit`, `totalAmount`, `depositAmount`, `balanceDue`.
- `holdResponse` y `publicView` devuelven `totalAmount/depositAmount/balanceDue`.
- `adminCreateReservation` también setea esos campos (admin puede cobrar seña o total).

### ✅ P1 — Captura de leads (IMPLEMENTADO 2026-06-29)
- `Lead` (`src/common/schemas/lead.schema.ts`): `service, experienceId?,
  preferredDate, quantity, customerName, customerEmail/Phone, source
  (WHATSAPP/WEB/ADMIN), status (NEW/CONTACTED/CLOSED), notes`.
- `POST /leads` público (lo usa el bot/web); `GET /leads` y `PATCH /leads/:id`
  admin. Módulo `LeadsModule`. El bot capta, el equipo sigue (no es handoff).

### P1 (pendiente) — Clasificar servicios + qué es reservable online
- `Experience.kind`: `SINGLE | MONTHLY | EVENT | RENTAL | PRODUCT`.
- `Experience.bookableOnline: boolean`. El bot y la landing **solo auto-reservan
  `SINGLE` + `bookableOnline=true`**. El resto → flujo de lead/coordinación.
- (Opcional) `minGroupSize`, `maxGroupSize`, `ageRange` (escuelita), `blackoutDates`.
- Por ahora se resuelve cargando como Experience SOLO las 3 singles; los demás
  servicios viven como conocimiento del bot + lead.

### P2 — Metadatos de ficha (para que el bot informe bien)
- `Experience.details`: `includes[]`, `deliveryTime`, `scheduleWindow`,
  `options[]` (variantes), `notes`. Editable desde admin; lo lee el bot por tool.

### P2 — Mensuales como suscripción (si se decide automatizar)
- Modelo aparte (`MonthlyEnrollment`): mes, día/horario fijo, seña 50%, saldo
  antes del 10, tramos (1 niño / 2 hermanos), 1ra clase gratis. Grande; evaluar
  si vale vs. seguir coordinando por el equipo.

## Reglas que el sistema YA garantiza (no romper)
- Cupo atómico (no se sobre-reserva). El backend es la autoridad, no el bot/LLM.
- Idempotencia de hold (doble-click no duplica).
- Reserva pública confirmada **solo** por webhook de pago OK; expira a los 10 min.
