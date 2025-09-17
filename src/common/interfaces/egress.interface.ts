import { Types } from 'mongoose';
import { Currency, EgressType, EgressStatus, PaymentMethod } from '../enums';

export interface IEgress {
  _id?: Types.ObjectId;
  egressNumber: string;
  concept: string;
  amount: number;
  currency: Currency;
  type: EgressType;
  paymentMethod: PaymentMethod;
  status: EgressStatus;
  notes?: string;
  authorizedBy?: string;
  userId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface ICreateEgress {
  concept: string;
  amount: number;
  currency: Currency;
  type: EgressType;
  notes?: string;
  authorizedBy?: string;
  userId?: Types.ObjectId;
}

export interface IUpdateEgress {
  concept?: string;
  amount?: number;
  currency?: Currency;
  type?: EgressType;
  status?: EgressStatus;
  notes?: string;
  authorizedBy?: string;
  userId?: Types.ObjectId;
}

export interface IEgressPaginatedFilter {
  page?: number;
  limit?: number;
  search?: string;
  from?: string;
  to?: string;
  status?: EgressStatus;
  type?: EgressType;
  currency?: Currency;
}