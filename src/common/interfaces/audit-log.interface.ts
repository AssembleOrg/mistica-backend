export interface AuditLog {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  userId?: string;
  userEmail?: string;
  ipAddress: string;
  oldValues?: any;
  newValues?: any;
  timestamp: Date;
} 