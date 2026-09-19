import { AuthRole } from '../auth/auth.dto.js';

export interface RequestUser {
  sub: string;
  role: AuthRole;
  phone: string;
}

export interface AuthenticatedRequest {
  user: RequestUser;
}
