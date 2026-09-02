import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

describe('AppController', () => {
  let appController: AppController;
  let app: TestingModule;

  beforeEach(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: {
            healthCheck: jest.fn(),
            getConnectionStatus: jest.fn(),
            getDatabaseInfo: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('does not expose database credentials', async () => {
      const database = app.get<DatabaseService>(DatabaseService);
      jest.spyOn(database, 'healthCheck').mockResolvedValue(true);
      jest.spyOn(database, 'getConnectionStatus').mockReturnValue('connected');
      process.env.DATABASE_URL = 'mongodb://user:secret@host/db';

      const result = await appController.getHealth();

      expect(result.database).toEqual({ connected: true, status: 'connected' });
      expect(result).toMatchObject({ databaseConfigured: true });
      expect(result).not.toHaveProperty('databaseUrl');
    });
  });
});
