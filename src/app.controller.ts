import { Controller, Get } from '@nestjs/common';
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
      databaseUrl: process.env.DATABASE_URL?.substring(0, 50) + '...',
    };
  }

  @Get('db-info')
  async getDatabaseInfo() {
    const dbInfo = await this.databaseService.getDatabaseInfo();
    return {
      timestamp: new Date().toISOString(),
      database: dbInfo,
    };
  }
}
