import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { WhatsappConnectionService } from './whatsapp-connection.service'
import { WhatsappConnectionController } from './whatsapp-connection.controller'
import { WhatsappMessageService } from './whatsapp-message.service'
import { WhatsappWebhookController } from './whatsapp-webhook.controller'

@Module({
  imports:     [PrismaModule],
  controllers: [WhatsappConnectionController, WhatsappWebhookController],
  providers:   [WhatsappConnectionService, WhatsappMessageService],
  exports:     [WhatsappConnectionService, WhatsappMessageService],
})
export class WhatsappModule {}
