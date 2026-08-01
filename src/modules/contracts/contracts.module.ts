import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { OpenSignModule } from '../opensign/opensign.module';

@Module({
  imports:     [PrismaModule, OpenSignModule],
  controllers: [ContractsController],
  providers:   [ContractsService],
  exports:     [ContractsService],
})
export class ContractsModule {}
