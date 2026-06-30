import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsModule } from './notifications/notifications.module';
import { BotControlModule } from './bot-control/bot-control.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
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
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';
import { ClientLabelsModule } from './client-labels/client-labels.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { ReservationsModule } from './reservations/reservations.module';
import { LeadsModule } from './leads/leads.module';
import { ClosedDatesModule } from './closed-dates/closed-dates.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
    AuditModule,
    ClientLabelsModule,
    ReservationsModule,
    ExperiencesModule,
    LeadsModule,
    ClosedDatesModule,
    NotificationsModule,
    BotControlModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule { }
