// backend/src/types/express/index.d.ts
declare namespace Express {
  export interface Request {
    user?: {
      id: string; // Diambil dari 'sub' di JWT
      role: string; // Diambil dari 'role' di JWT
      email?: string;
    };
  }
}
