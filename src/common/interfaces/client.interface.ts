export interface Client {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  notes?: string;
  cuit?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  prepaid?: number; // Total de prepaids pendientes
}

export interface ClientWithPrepaids extends Client {
  prepaids: Prepaid[];
}

import type { PaymentMethod } from '../enums';

export interface Prepaid {
  id: string;
  clientId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  receivedAmount?: number;
  changeGiven?: number;
  status: 'PENDING' | 'CONSUMED';
  notes?: string;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
