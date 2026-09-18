import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Roles } from './common/decorators/roles.decorator';
import { UserRole } from './common/enums/user-role.enum';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    const dbStatus = await this.databaseService.healthCheck();
    const connectionStatus = this.databaseService.getConnectionStatus();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus,
        status: connectionStatus,
      },
      environment: process.env.NODE_ENV || 'unknown',
      // Nunca exponer la URL: puede incluir usuario y contraseña de Mongo.
      databaseConfigured: Boolean(process.env.DATABASE_URL),
    };
  }

  // Diagnóstico: expone versión y tamaños de la base, sólo para el admin.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('db-info')
  async getDatabaseInfo() {
    const dbInfo = await this.databaseService.getDatabaseInfo();
    return {
      timestamp: new Date().toISOString(),
      database: dbInfo,
    };
  }
}
