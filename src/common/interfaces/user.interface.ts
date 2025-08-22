import { UserRole } from '@prisma/client';

export interface User {
  id: string;
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
} 