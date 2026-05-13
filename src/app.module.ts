import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { SalesModule } from './sales/sales.module';
import { ClientsModule } from './clients/clients.module';
import { PrepaidsModule } from './prepaids/prepaids.module';
import { EgressesModule } from './egresses/egresses.module';
import { CashboxModule } from './cashbox/cashbox.module';
import { FinanceModule } from './finance/finance.module';
import { CreditNotesModule } from './credit-notes/credit-notes.module';

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
    CategoriesModule,
    SalesModule,
    ClientsModule,
    PrepaidsModule,
    EgressesModule,
    CashboxModule,
    FinanceModule,
    CreditNotesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
