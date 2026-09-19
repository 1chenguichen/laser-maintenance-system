import { AuthRole } from './auth/auth.dto.js';

declare global {
  namespace Express {
    interface Request {
      user: {
        sub: string;
        role: AuthRole;
        phone: string;
      };
    }
  }
}

export {};
