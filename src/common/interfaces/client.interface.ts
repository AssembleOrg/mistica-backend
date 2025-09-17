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

export interface Prepaid {
  id: string;
  clientId: string;
  amount: number;
  status: 'PENDING' | 'CONSUMED';
  notes?: string;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
