import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NewRelicModule } from './common/newrelic/newrelic.module.js';

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
import { MicrosoftAuthModule } from './modules/microsoft-auth/microsoft-auth.module';
import { ClickUpAuthModule } from './modules/clickup-auth/clickup-auth.module';
import { ClickUpModule } from './modules/clickup/clickup.module';
import { FlodeskModule } from './modules/flodesk/flodesk.module';
import { CanvaAuthModule } from './modules/canva-auth/canva-auth.module';
import { CanvaModule } from './modules/canva/canva.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ProposalTemplatesModule } from './modules/proposal-templates/proposal-templates.module';
import { FormsModule } from './modules/forms/forms.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { TimeEntriesModule } from './modules/time-entries/time-entries.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TaskBoardsModule } from './modules/task-boards/task-boards.module';
import { EmailTemplatesModule } from './modules/email-templates/email-templates.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { PublicProfilesModule } from './modules/public-profiles/public-profiles.module';
import { GoogleFormsModule } from './modules/google-forms/google-forms.module';
import { GoogleDocsModule } from './modules/google-docs/google-docs.module';
import { GoogleSheetsModule } from './modules/google-sheets/google-sheets.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TeamModule } from './modules/team/team.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { PermissionsModule } from './modules/permissions/permissions.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { WorkspacePermissionGuard } from './common/guards/workspace-permission.guard';
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
        // In production: emit JSON enriched with New Relic trace/span IDs via mixin
        // In development: human-readable pino-pretty output
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        ...(process.env.NODE_ENV === 'production' && process.env.NEW_RELIC_LICENSE_KEY
          ? {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              mixin: require('@newrelic/pino-enricher') as () => Record<string, unknown>,
            }
          : {}),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    NewRelicModule,
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
    MicrosoftAuthModule,
    ClickUpAuthModule,
    ClickUpModule,
    FlodeskModule,
    CanvaAuthModule,
    CanvaModule,
    MeetingsModule,
    ProposalTemplatesModule,
    FormsModule,
    WorkflowsModule,
    TimeEntriesModule,
    ExpensesModule,
    ReportsModule,
    ProjectsModule,
    TasksModule,
    TaskBoardsModule,
    EmailTemplatesModule,
    AttachmentsModule,
    CalendarModule,
    PublicProfilesModule,
    GoogleFormsModule,
    GoogleDocsModule,
    GoogleSheetsModule,
    PaymentsModule,
    TeamModule,
    MessagesModule,
    WorkspacesModule,
    PermissionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: WorkspacePermissionGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule {}
