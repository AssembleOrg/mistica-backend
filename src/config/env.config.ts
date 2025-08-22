export const envConfig = {
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/mistica_autentica',
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
}; 