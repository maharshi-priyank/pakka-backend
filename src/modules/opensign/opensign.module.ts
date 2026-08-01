import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { OpenSignService } from './opensign.service';
import { OpenSignPdfGenerator } from './opensign.pdf-generator';
import { OpenSignWebhookController } from './opensign.webhook.controller';

@Module({
  imports:     [ConfigModule, PrismaModule],
  controllers: [OpenSignWebhookController],
  providers:   [OpenSignService, OpenSignPdfGenerator],
  exports:     [OpenSignService, OpenSignPdfGenerator],
})
export class OpenSignModule {}
