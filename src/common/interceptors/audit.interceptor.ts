import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUDITORY_KEY, AuditoryOptions } from '../decorators';
import { AuditLogDocument } from '../schemas';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel('AuditLog') private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditoryOptions>(
      AUDITORY_KEY,
      context.getHandler(),
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as any;
    const ipAddress = this.getIpAddress(request);

    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.logAudit(auditOptions, data, user, ipAddress);
        } catch (error) {
          // Log error but don't fail the request
          console.error('Error logging audit:', error);
        }
      }),
    );
  }

  private getIpAddress(request: Request): string {
    return (
      request.headers['x-forwarded-for'] ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    ) as string;
  }

  private async logAudit(
    options: AuditoryOptions,
    data: any,
    user: any,
    ipAddress: string,
  ): Promise<void> {
    const entityId = this.extractEntityId(data, options.entity);
    
    await this.auditLogModel.create({
      entity: options.entity,
      entityId: entityId || 'unknown',
      action: options.action,
      userId: user?.id,
      userEmail: user?.email,
      ipAddress,
      newValues: data,
      timestamp: new Date(),
    });
  }

  private extractEntityId(data: any, entity: string): string | null {
    if (!data) return null;
    
    // Try to extract ID from common patterns
    if (data.id) return data.id;
    if (data[`${entity}Id`]) return data[`${entity}Id`];
    
    // For arrays, try to get the first item's ID
    if (Array.isArray(data) && data.length > 0) {
      return this.extractEntityId(data[0], entity);
    }
    
    return null;
  }
} 