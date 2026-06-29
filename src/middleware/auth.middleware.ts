import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifySignature } from '../utils/signedUrl';
import { PUB_KEY } from '../config/keys';


export interface AuthRequest extends Request {
  userId?: string;
}


/**
 * Middleware to verify JWT access token from request cookies.
 * 
 * Extracts the access token from the request cookies, validates it using RS256 algorithm,
 * and attaches the decoded user ID to the request object if valid.
 * 
 * @param req - The Express request object with cookies and custom AuthRequest properties
 * @param res - The Express response object
 * @param next - The Express next middleware function
 * 
 * @returns Calls next() if token is valid, otherwise sends 401 JSON error response
 * 
 * @throws Returns 401 status with error message if:
 *   - No token is present in cookies
 *   - Token is expired
 *   - Token verification fails for any other reason
 */
export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {

  let token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, PUB_KEY, { algorithms: ['RS256'] }) as { userId: string };
    
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      console.log('⏰ Token expired - client will refresh');
    } else {
      console.error('❌ Token verification failed:', error);
    }
    
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