export const envConfig = {
  database: {
    url:
      process.env.DATABASE_URL ||
      'mongodb://mongo:YWVqKIersyo@ni.proxy.rlwy.net:23351/test?authSource=admin',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'tu_jwt_secret_super_seguro_aqui',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED === 'true',
  },
  // MercadoPago quedó INACTIVO: el único medio de pago del cliente es la
  // transferencia con comprobante. El módulo sigue en el repo (webhook y
  // reembolsos) para no romper reservas históricas, pero no se crean
  // preferences nuevas.
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN || '',
    // Secreto de la firma del webhook (Tus integraciones → Webhooks → Firma).
    // Si está vacío, no se valida firma (sólo recomendable en dev).
    webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
  },
  // Datos bancarios para que el cliente transfiera la seña. Los muestra la
  // landing al reservar y el bot por WhatsApp: tienen que coincidir con los
  // del bot (TRANSFER_ALIAS / TRANSFER_OWNER_NAME / TRANSFER_BANK).
  transfer: {
    alias: process.env.TRANSFER_ALIAS || '',
    ownerName: process.env.TRANSFER_OWNER_NAME || '',
    bank: process.env.TRANSFER_BANK || '',
  },
  // TESTING: confirma las reservas públicas al crear el hold, SIN esperar el
  // comprobante de transferencia. Sólo para probar el flujo de punta a punta;
  // NUNCA encender en producción real (los turnos quedarían tomados sin seña).
  autoConfirmHolds: process.env.AUTO_CONFIRM_HOLDS === 'true',
  // WhatsApp del negocio al que el cliente manda el comprobante (formato
  // internacional sin +, ej. 5491122334455). La landing arma el link wa.me.
  businessWhatsapp: process.env.BUSINESS_WHATSAPP || '',
  urls: {
    // Front público (back_urls de la preference: success/failure/pending).
    frontend: process.env.FRONTEND_URL || 'http://localhost:3001',
    // Base pública de este backend (notification_url del webhook).
    backend: process.env.BACKEND_URL || 'http://localhost:3000',
  },
  // Bot de WhatsApp: server de control (enviar mensajes, ver QR, reconectar).
  botControl: {
    // URL base del control server del bot (ej. https://mistica-bot.up.railway.app).
    url: process.env.BOT_CONTROL_URL || '',
    // Secreto compartido (X-Bot-Secret). Sin esto, no se notifica ni se controla.
    secret: process.env.BOT_CONTROL_SECRET || '',
    // Minutos sin actividad tras los que una charla del bot se da por cerrada
    // (la próxima consulta del mismo teléfono abre una charla nueva). Debe ser
    // >= al TTL de sesión del bot (30 min) para no partir una charla viva.
    conversationSessionMinutes: Number(
      process.env.CONVERSATION_SESSION_MINUTES || 45,
    ),
  },
  // WhatsApp del equipo para avisos internos (nuevas consultas, errores).
  teamWhatsapp: process.env.TEAM_WHATSAPP || '',
  // Días/horarios de retiro de piezas (texto libre). Se usa en el aviso de
  // "piezas listas". Ej: "de martes a viernes de 15 a 19 h".
  pickupInfo: process.env.PICKUP_INFO || 'en nuestro horario de atención',
  // Zona horaria del negocio: las fechas/horas de turnos se interpretan acá.
  timezone: process.env.TZ_BUSINESS || 'America/Argentina/Buenos_Aires',
  // Minutos de limpieza/preparación después de CADA reserva: la mesa queda
  // ocupada hasta endAt + este buffer antes de poder recibir al próximo grupo.
  cleaningBufferMinutes: Number.parseInt(
    process.env.CLEANING_BUFFER_MINUTES || '10',
    10,
  ),
  // Ventana de reservas del día, en hora local del negocio. Ninguna reserva
  // puede empezar antes de `open` ni terminar después de `close`.
  businessOpen: process.env.BUSINESS_OPEN || '15:00',
  businessClose: process.env.BUSINESS_CLOSE || '20:00',
  // Turnos SUGERIDOS del día, en hora local del negocio. Formato:
  // "T1|Turno 1|15:00|17:30;T2|Turno 2|17:50|20:00". Ya no son bloques
  // rígidos: la reserva puede arrancar a cualquier hora dentro de la ventana
  // del negocio; los turnos sólo ordenan la oferta (landing/bot los sugieren).
  shifts: process.env.SHIFTS || 'T1|Turno 1|15:00|17:30;T2|Turno 2|17:50|20:00',
  // ¿Un grupo chico (≤6) puede quedarse con una mesa grande entera cuando no
  // hay mesas de 2 ni posibilidad de compartida? Por defecto NO: las grandes se
  // reservan para grupos numerosos y el grupo chico se rechaza.
  smallGroupCanTakeLarge: process.env.SMALL_GROUP_CAN_TAKE_LARGE === 'true',
  // DigitalOcean Spaces (S3-compatible): guarda las imágenes de comprobantes
  // de transferencia que llegan por WhatsApp sin reserva pendiente, para
  // verificación humana posterior. Sin bucket/keys, la subida se omite (la
  // consulta se registra igual, sin imagen).
  spaces: {
    key: process.env.DO_SPACES_KEY || '',
    secret: process.env.DO_SPACES_SECRET || '',
    region: process.env.DO_SPACES_REGION || 'nyc3',
    bucket: process.env.DO_SPACES_BUCKET || '',
    // Ej: https://nyc3.digitaloceanspaces.com (endpoint del REGION, sin bucket).
    endpoint: process.env.DO_SPACES_ENDPOINT || '',
    // URL pública para servir imágenes. Con CDN habilitado en el Space:
    // https://<bucket>.<region>.cdn.digitaloceanspaces.com. Vacía = se deriva
    // <bucket>.<endpoint> (sin CDN).
    cdnUrl: process.env.DO_SPACES_CDN_URL || '',
  },
};
