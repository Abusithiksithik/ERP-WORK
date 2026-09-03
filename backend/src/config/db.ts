import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD must be set in production');
}

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'epft',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '12345',
  max: parseInt(process.env.DB_POOL_MAX || '30', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);
