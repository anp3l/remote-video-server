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
