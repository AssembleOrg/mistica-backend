import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async healthCheck(): Promise<boolean> {
    try {
      // Check if connection is ready
      if (this.connection.readyState === 1 && this.connection.db) {
        // Test with a simple command
        await this.connection.db.admin().ping();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }

  getConnectionStatus(): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    return states[this.connection.readyState] || 'unknown';
  }

  async getDatabaseInfo() {
    try {
      if (!this.connection.db) {
        throw new Error('Database not connected');
      }

      const adminDb = this.connection.db.admin();
      const dbInfo = await adminDb.serverInfo();
      const dbStats = await this.connection.db.stats();
      
      return {
        version: dbInfo.version,
        database: this.connection.name,
        collections: dbStats.collections,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes,
        objects: dbStats.objects,
      };
    } catch (error) {
      this.logger.error('Failed to get database info:', error);
      return null;
    }
  }
}
