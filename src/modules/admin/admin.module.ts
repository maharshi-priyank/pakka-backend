import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { AdminActionsService } from './actions/admin-actions.service';
import { AdminActionsController } from './actions/admin-actions.controller';
import { AdminBillingService } from './billing/admin-billing.service';
import { AdminBillingController } from './billing/admin-billing.controller';
import { AdminImpersonationService } from './impersonation/admin-impersonation.service';
import { AdminImpersonationController } from './impersonation/admin-impersonation.controller';
import { ImpersonationVerifier } from './impersonation/impersonation.guard';
import { ConsumedJtiStore } from './impersonation/consumed-jti.store';
import { ImpersonationAuditInterceptor } from './impersonation/impersonation-audit.interceptor';
import { AdminOversightService } from './oversight/admin-oversight.service';
import { AdminOversightController } from './oversight/admin-oversight.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminWorkspacesService } from './workspaces/admin-workspaces.service';
import { AdminWorkspacesController } from './workspaces/admin-workspaces.controller';
import { AdminAnalyticsService } from './analytics/admin-analytics.service';
import { AdminAnalyticsController } from './analytics/admin-analytics.controller';
import { AdminSupportNotesService } from './support/admin-support-notes.service';
import { AdminSupportNotesController } from './support/admin-support-notes.controller';
import { AdminTimelineService } from './timeline/admin-timeline.service';
import { AdminSearchService } from './search/admin-search.service';
import { AdminSearchController } from './search/admin-search.controller';
import { AdminBillingOperationsService } from './billing-operations/admin-billing-operations.service';
import { AdminBillingOperationsController } from './billing-operations/admin-billing-operations.controller';
import { AdminWorkspaceAdministrationService } from './workspace-administration/admin-workspace-administration.service';
import { AdminWorkspaceAdministrationController } from './workspace-administration/admin-workspace-administration.controller';
import { AdminSupportReportingService } from './support-reporting/admin-support-reporting.service';
import { AdminSupportReportingController } from './support-reporting/admin-support-reporting.controller';
import { AdminSecurityService } from './security/admin-security.service';
import { AdminSecurityController } from './security/admin-security.controller';
import { AdminSavedViewsService } from './saved-views/admin-saved-views.service';
import { AdminSavedViewsController } from './saved-views/admin-saved-views.controller';
import { AdminAlertsService } from './alerts/admin-alerts.service';
import { AdminAlertsController } from './alerts/admin-alerts.controller';
import { AdminBulkOperationsService } from './bulk-operations/admin-bulk-operations.service';
import { AdminBulkOperationsController } from './bulk-operations/admin-bulk-operations.controller';
import { AdminTemplateConfigurationService } from './configuration/templates/admin-template-configuration.service';
import { AdminTemplateConfigurationController } from './configuration/templates/admin-template-configuration.controller';
import { AdminAutomationConfigurationService } from './configuration/automation/admin-automation-configuration.service';
import { AdminAutomationConfigurationController } from './configuration/automation/admin-automation-configuration.controller';
import { AdminIntegrationHealthService } from './configuration/integrations/admin-integration-health.service';
import { AdminIntegrationHealthController } from './configuration/integrations/admin-integration-health.controller';
import { AdminBusinessIntelligenceService } from './business-intelligence/admin-business-intelligence.service';
import { AdminBusinessIntelligenceController } from './business-intelligence/admin-business-intelligence.controller';
import { AdminTeamService } from './team/admin-team.service';
import { AdminTeamController } from './team/admin-team.controller';
import { AdminOperationsService } from './operations/admin-operations.service';
import { AdminOperationsController } from './operations/admin-operations.controller';
import { AdminCustomersService } from './customers/admin-customers.service';
import { AdminCustomersController } from './customers/admin-customers.controller';
import { AdminCommandCenterService } from './command-center/admin-command-center.service';
import { AdminCommandCenterController } from './command-center/admin-command-center.controller';
import { AdminGrowthModule } from './growth/admin-growth.module';

/**
 * Admin module — superadmin-only panel API.
 *
 * Controllers under /admin/** are marked @Public() so the global JwtAuthGuard
 * (Supabase JWKS) and WorkspacePermissionGuard skip them; each admin controller
 * applies @UseGuards(AdminGuard) as its sole authz authority. Admin identity is
 * separate from tenant User accounts (AdminUser table + own admin JWT signed
 * with ADMIN_JWT_SECRET).
 *
 * Remaining submodules (actions, billing, audit-read, impersonation) register
 * here as they are built (U4–U6).
 */
@Module({
  imports: [
    PrismaModule,
    PaymentsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('admin.jwtSecret') ?? 'dev-admin-secret',
      }),
    }),
    AdminGrowthModule,
  ],
  controllers: [
    AdminAuthController,
    AdminOversightController,
    AdminUsersController,
    AdminWorkspacesController,
    AdminAnalyticsController,
    AdminSupportNotesController,
    AdminSearchController,
    AdminBillingOperationsController,
    AdminWorkspaceAdministrationController,
    AdminSupportReportingController,
    AdminSecurityController,
    AdminSavedViewsController,
    AdminAlertsController,
    AdminBulkOperationsController,
    AdminTemplateConfigurationController,
    AdminAutomationConfigurationController,
    AdminIntegrationHealthController,
    AdminBusinessIntelligenceController,
    AdminTeamController,
    AdminOperationsController,
    AdminCustomersController,
    AdminCommandCenterController,
    AuditController,
    AdminActionsController,
    AdminBillingController,
    AdminImpersonationController,
  ],
  providers: [
    AdminJwtStrategy,
    AdminAuthService,
    AuditService,
    AdminOversightService,
    AdminUsersService,
    AdminWorkspacesService,
    AdminAnalyticsService,
    AdminSupportNotesService,
    AdminTimelineService,
    AdminSearchService,
    AdminBillingOperationsService,
    AdminWorkspaceAdministrationService,
    AdminSupportReportingService,
    AdminSecurityService,
    AdminSavedViewsService,
    AdminAlertsService,
    AdminBulkOperationsService,
    AdminTemplateConfigurationService,
    AdminAutomationConfigurationService,
    AdminIntegrationHealthService,
    AdminBusinessIntelligenceService,
    AdminTeamService,
    AdminOperationsService,
    AdminCustomersService,
    AdminCommandCenterService,
    AdminActionsService,
    AdminBillingService,
    AdminImpersonationService,
    ImpersonationVerifier,
    ConsumedJtiStore,
    { provide: APP_INTERCEPTOR, useClass: ImpersonationAuditInterceptor },
  ],
  exports: [AuditService, AdminAuthService, JwtModule, PassportModule],
})
export class AdminModule {}
