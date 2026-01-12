import fs from 'fs';
import path from 'path';

const publicKeyPath = path.join(__dirname, '../../public.pem');

let publicKey: string;

try {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
} catch (error) {
  console.error('❌ FATAL ERROR: public.pem not found in project root');
  console.error('Copy it from the auth-server project.');
  process.exit(1);
}

export const PUB_KEY = publicKey;
