import { EmployeeRole } from '@prisma/client';

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  phone: string | null;
  address: string | null;
  startDate: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
} 