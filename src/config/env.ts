import dotenv from 'dotenv';
dotenv.config();

if (!process.env.STREAM_SECRET) {
  throw new Error('Missing: process.env.STREAM_SECRET');
}

if (!process.env.MONGO_URI) {
  throw new Error('Missing: process.env.MONGO_URI');
}

export const STREAM_SECRET = process.env.STREAM_SECRET;
export const MONGO_URI = process.env.MONGO_URI;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const ENABLE_LOGS = process.env.ENABLE_LOGS === 'true';
export const PORT = process.env.PORT;

// CORS Origins (production)
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:4200']; // Default Angular + fallback

// Cookie Security Configuration
export const COOKIE_DOMAIN = NODE_ENV === 'production' 
  ? process.env.COOKIE_DOMAIN 
  : 'localhost';
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
export const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax') as 'strict' | 'lax' | 'none';

// CSRF Protection
export const CSRF_SECRET = process.env.CSRF_SECRET!;
