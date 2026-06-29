export const envConfig = {
  database: {
    url: process.env.DATABASE_URL || 'mongodb://mongo:YWVqKIersyo@ni.proxy.rlwy.net:23351/test?authSource=admin',
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
  mercadopago: {
    accessToken: process.env.MP_ACCESS_TOKEN || '',
    // Secreto de la firma del webhook (Tus integraciones → Webhooks → Firma).
    // Si está vacío, no se valida firma (sólo recomendable en dev).
    webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
  },
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
  },
  // WhatsApp del equipo para avisos internos (nuevas consultas, errores).
  teamWhatsapp: process.env.TEAM_WHATSAPP || '',
  // Zona horaria del negocio: las fechas/horas de turnos se interpretan acá.
  timezone: process.env.TZ_BUSINESS || 'America/Argentina/Buenos_Aires',
};