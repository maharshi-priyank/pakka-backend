import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductEventsController } from './product-events.controller';
import { ProductEventsService } from './product-events.service';
import { ProductEventsListener } from './product-events.listener';

@Module({
  imports: [PrismaModule],
  controllers: [ProductEventsController],
  providers: [ProductEventsService, ProductEventsListener],
  exports: [ProductEventsService],
})
export class ProductEventsModule {}
