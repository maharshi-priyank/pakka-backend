import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { configuration, validationSchema } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { ClientsModule } from './modules/clients/clients.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { PortalModule } from './modules/portal/portal.module';
import { GoogleAuthModule } from './modules/google-auth/google-auth.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ProposalTemplatesModule } from './modules/proposal-templates/proposal-templates.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    ProposalsModule,
    ContractsModule,
    InvoicesModule,
    DashboardModule,
    AutomationsModule,
    ClientsModule,
    NotificationsModule,
    AiModule,
    PortalModule,
    GoogleAuthModule,
    MeetingsModule,
    ProposalTemplatesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
