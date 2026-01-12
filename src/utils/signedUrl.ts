import crypto from 'crypto';
import { STREAM_SECRET } from '../config/env';

export interface SignedUrlParams {
  videoId: string;
  userId: string;
  expiresInMinutes?: number;
}

/**
 * Generates a signed URL using HMAC-SHA256 algorithm.
 * The signed URL is a query string containing the video ID, user ID, expiration timestamp, and signature.
 * The expiration timestamp is in milliseconds since epoch.
 * The signature is a hexadecimal string generated using the HMAC-SHA256 algorithm with the video ID, user ID, and expiration timestamp as the input.
 * The generated signed URL can be used to securely access video streaming and thumbnail URLs.
 * @param params - An object containing the video ID, user ID, and optional expiration time in minutes.
 * @returns A signed URL query string.
 */
export function generateSignedUrl(params: SignedUrlParams): string {
  const { videoId, userId, expiresInMinutes = 10 } = params;
  const expires = Date.now() + (expiresInMinutes * 60 * 1000);
  
  const signature = crypto
    .createHmac('sha256', STREAM_SECRET)
    .update(`${videoId}:${userId}:${expires}`)
    .digest('hex');
  
  return `?expires=${expires}&signature=${signature}&uid=${userId}`;
}

/**
 * Verifies a signed URL using the HMAC-SHA256 algorithm.
 * Checks the expiration timestamp and verifies the signature.
 * Returns an object with a valid boolean property and an optional reason string property.
 * If valid is false, the reason property will contain a string describing the reason for the invalid signature.
 * @param videoId - The video ID.
 * @param userId - The user ID.
 * @param expires - The expiration timestamp in milliseconds since epoch.
 * @param signature - The signature generated using the HMAC-SHA256 algorithm.
 * @returns An object with a valid boolean property and an optional reason string property.
 */
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
    .createHmac('sha256', STREAM_SECRET)
    .update(`${videoId}:${userId}:${expires}`)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return { valid: false, reason: 'Invalid signature' };
  }
  
  return { valid: true };
}
