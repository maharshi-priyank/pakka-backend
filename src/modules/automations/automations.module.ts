import { Module, forwardRef } from '@nestjs/common'
import { AutomationsController } from './automations.controller'
import { AutomationsService } from './automations.service'
import { AutomationEngine } from './automation.engine'
import { AutomationScheduler } from './automation.scheduler'
import { EmailService } from './email.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { WhatsappModule } from '../whatsapp/whatsapp.module'

@Module({
  imports:     [PrismaModule, InvoicesModule, forwardRef(() => WhatsappModule)],
  controllers: [AutomationsController],
  providers:   [AutomationsService, AutomationEngine, AutomationScheduler, EmailService],
  exports:     [AutomationsService, AutomationEngine, EmailService],
})
export class AutomationsModule {}
