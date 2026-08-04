import { UserRole } from '../enums';

export interface User {
  id?: string; // Optional since Mongoose uses _id
  _id?: string; // Mongoose ObjectId
  email: string;
  name: string;
  password: string;
  role: UserRole;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar: string | null;
  /** Vistas del panel habilitadas; vacío = acceso estándar según el rol. */
  allowedViews: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}