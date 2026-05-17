import { Module } from '@nestjs/common'
import { AutomationsController } from './automations.controller'
import { AutomationsService } from './automations.service'
import { AutomationEngine } from './automation.engine'
import { AutomationScheduler } from './automation.scheduler'
import { EmailService } from './email.service'
import { PrismaModule } from '../../prisma/prisma.module'

@Module({
  imports:     [PrismaModule],
  controllers: [AutomationsController],
  providers:   [AutomationsService, AutomationEngine, AutomationScheduler, EmailService],
  exports:     [AutomationsService, AutomationEngine, EmailService],
})
export class AutomationsModule {}
