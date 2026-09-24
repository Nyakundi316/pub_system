export interface AuthUser {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  permissions: string[];
}

// Augment Express so req.user is typed everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
