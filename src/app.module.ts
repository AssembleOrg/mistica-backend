import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { ClientsModule } from './clients/clients.module';
import { PrepaidsModule } from './prepaids/prepaids.module';
import { EgressesModule } from './egresses/egresses.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    EmployeesModule,
    UsersModule,
    ProductsModule,
    SalesModule,
    ClientsModule,
    PrepaidsModule,
    EgressesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
