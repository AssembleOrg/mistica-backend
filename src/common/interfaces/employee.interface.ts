import { EmployeeRole } from '../enums';

export interface Employee {
  id?: string; // Optional since Mongoose uses _id
  _id?: string; // Mongoose ObjectId
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