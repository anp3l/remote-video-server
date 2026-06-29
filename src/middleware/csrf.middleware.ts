import { doubleCsrf } from 'csrf-csrf';
import { CSRF_SECRET, COOKIE_SECURE, COOKIE_SAMESITE, COOKIE_DOMAIN } from '../config/env';

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  // Binds the CSRF token to the current JWT session so tokens can't cross sessions
  getSessionIdentifier: (req) => req.cookies?.accessToken ?? '',
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE as 'strict' | 'lax' | 'none',
    domain: COOKIE_DOMAIN || undefined,
  },
});

export { generateCsrfToken, doubleCsrfProtection as csrfProtection };
