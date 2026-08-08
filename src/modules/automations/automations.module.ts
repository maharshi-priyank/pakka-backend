import { Module, forwardRef } from '@nestjs/common'
import { AutomationsController } from './automations.controller'
import { AutomationsService } from './automations.service'
import { AutomationEngine } from './automation.engine'
import { AutomationScheduler } from './automation.scheduler'
import { EmailService } from './email.service'
import { NotificationsListener } from './notifications.listener'
import { PrismaModule } from '../../prisma/prisma.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { WhatsappModule } from '../whatsapp/whatsapp.module'
import { PublicProfilesModule } from '../public-profiles/public-profiles.module'

@Module({
  imports:     [PrismaModule, InvoicesModule, forwardRef(() => WhatsappModule), PublicProfilesModule],
  controllers: [AutomationsController],
  providers:   [AutomationsService, AutomationEngine, AutomationScheduler, EmailService, NotificationsListener],
  exports:     [AutomationsService, AutomationEngine, EmailService],
})
export class AutomationsModule {}
