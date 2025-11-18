import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface SignedUrlParams {
  videoId: string;
  userId: string;
  expiresInMinutes?: number;
}

export function generateSignedUrl(params: SignedUrlParams): string {
  const { videoId, userId, expiresInMinutes = 10 } = params;
  const expires = Date.now() + (expiresInMinutes * 60 * 1000);
  
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${videoId}:${userId}:${expires}`)
    .digest('hex');
  
  return `?expires=${expires}&signature=${signature}&uid=${userId}`;
}

export function verifySignature(
  videoId: string,
  userId: string,
  expires: string,
  signature: string
): { valid: boolean; reason?: string } {
  // Check expiration
  const expiryTime = Number(expires);
  if (isNaN(expiryTime)) {
    return { valid: false, reason: 'Invalid expiration format' };
  }
  
  if (Date.now() > expiryTime) {
    return { valid: false, reason: 'Signed URL expired' };
  }
  
  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${videoId}:${userId}:${expires}`)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return { valid: false, reason: 'Invalid signature' };
  }
  
  return { valid: true };
}
