import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifySignature } from '../utils/signedUrl';
import { PUB_KEY } from '../config/keys';


export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Middleware function that verifies JWT tokens in the Authorization header.
 * 
 * Extracts the Bearer token from the request's Authorization header, verifies it using RS256 algorithm,
 * and attaches the decoded userId to the request object if valid.
 * 
 * @param {AuthRequest} req - The Express request object with userId property
 * @param {Response} res - The Express response object
 * @param {NextFunction} next - The Express next middleware function
 * 
 * @returns {void}
 * 
 * @throws {401} Missing token - If Authorization header is missing or doesn't start with "Bearer "
 * @throws {401} Invalid or expired token - If token verification fails or token is expired
 * 
 * @example
 * app.use(verifyToken);
 */
export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, PUB_KEY, { algorithms: ['RS256'] }) as { userId: string };
    
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Verify the signed URL parameters in the request query.
 * If any of the parameters are missing, the signature is invalid, or the
 * signature has expired, return a 401 response.
 * If the signature is valid, set the userId property of the request object
 * and call the next middleware function.
 * @param {AuthRequest} req - The request object
 * @param {Response} res - The response object
 * @param {NextFunction} next - The next middleware function
 */
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