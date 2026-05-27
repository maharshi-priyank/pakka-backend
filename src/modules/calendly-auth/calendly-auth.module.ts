import { Module } from '@nestjs/common';
import { CalendlyAuthController } from './calendly-auth.controller';
import { CalendlyAuthService } from './calendly-auth.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports:     [UsersModule, PrismaModule],
  controllers: [CalendlyAuthController],
  providers:   [CalendlyAuthService],
  exports:     [CalendlyAuthService],
})
export class CalendlyAuthModule {}
