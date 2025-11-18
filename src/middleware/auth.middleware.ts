import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifySignature } from '../utils/signedUrl';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  userId?: string;
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Middleware for signed URLs
export const verifySignedUrl = (req: AuthRequest, res: Response, next: NextFunction) => {
  const { expires, signature, uid } = req.query;
  const videoId = req.params.id;

  if (!expires || !signature || !uid) {
    return res.status(401).json({ error: 'Missing signature parameters' });
  }

  const result = verifySignature(
    videoId,
    uid as string,
    expires as string,
    signature as string
  );

  if (!result.valid) {
    return res.status(401).json({ error: result.reason || 'Invalid signature' });
  }

  // Set userId for downstream handlers
  req.userId = uid as string;
  next();
};