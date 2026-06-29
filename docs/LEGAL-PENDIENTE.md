# Pendientes legales / datos (Mística)

> Anotado para no perderlo. NO implementado todavía (decisión: dejarlo para más
> adelante). Relevante porque el bot y la web captan datos personales.

## Privacidad — Ley 25.326 (Protección de Datos Personales, Argentina)
Se captan datos personales (nombre, teléfono, email) por el bot de WhatsApp, los
leads y las reservas. Pendiente:
- **Aviso de privacidad / consentimiento**: informar para qué se usan los datos
  (gestionar reservas/consultas) y que no se comparten con terceros. Sugerido:
  - Bot: una línea en el primer contacto o al pedir datos ("usamos tus datos solo
    para tu reserva").
  - Web: nota/link de "Política de privacidad" en el form de reserva y en el footer.
- **Derechos del titular** (acceso/rectificación/supresión): definir un canal
  (ej. escribir al local) para ejercerlos.
- **Base de datos**: el organismo de aplicación es la AAIP. Evaluar si corresponde
  registrar la base (según volumen/uso).

## Política de cancelación / términos de la seña
Hoy NO está definida ni comunicada. Definir y comunicar (bot + web):
- ¿La seña (50%) es reembolsable? ¿Con cuánta anticipación?
- Plazos para reprogramar.
- Qué pasa si el cliente no asiste (no-show).
Una vez definida, el bot debe poder explicarla (agregar al prompt) y la web
mostrarla en el flujo de reserva.

## Retención de datos
Decisión actual: **no borrar** conversaciones, leads ni reservas por ahora. A
futuro, definir una política de retención/borrado acorde a la Ley 25.326.
