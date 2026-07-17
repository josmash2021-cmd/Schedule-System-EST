require('dotenv').config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

module.exports = {
  PORT,
  NODE_ENV,
  DATABASE_URL,
  ADMIN_PASSWORD,
  CORS_ORIGIN,
};
