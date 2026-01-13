import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function getPublicKey(): string {
  // 1. PRIORITY: Environment Variable (Docker / Production)
  if (process.env.PUBLIC_KEY_BASE64) {
    try {
      return Buffer.from(process.env.PUBLIC_KEY_BASE64, 'base64').toString('utf-8');
    } catch (err) {
      console.error('❌ FATAL ERROR: Failed to decode PUBLIC_KEY_BASE64');
      process.exit(1);
    }
  }

  // 2. FALLBACK: File System (Local Development)
  const publicKeyPath = path.join(process.cwd(), 'public.pem');
  try {
    return fs.readFileSync(publicKeyPath, 'utf8');
  } catch (error) {
    console.error(`❌ FATAL ERROR: Public Key missing.`);
    console.error(`   - Docker/Prod: Set PUBLIC_KEY_BASE64 in .env`);
    console.error(`   - Local Dev: Place public.pem in root`);
    process.exit(1);
  }
}

export const PUB_KEY = getPublicKey();
