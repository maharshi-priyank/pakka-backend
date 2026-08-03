import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import { AdminGrowthController } from './admin-growth.controller';
import { AdminGrowthService } from './admin-growth.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminGrowthController],
  providers: [AdminGrowthService, AuditService],
  exports: [AdminGrowthService],
})
export class AdminGrowthModule {}
