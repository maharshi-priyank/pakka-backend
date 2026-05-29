import { Module } from '@nestjs/common'
import { EmailTemplatesController } from './email-templates.controller'
import { EmailTemplatesService } from './email-templates.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  imports:     [PrismaModule, AutomationsModule],
  controllers: [EmailTemplatesController],
  providers:   [EmailTemplatesService],
  exports:     [EmailTemplatesService],
})
export class EmailTemplatesModule {}
