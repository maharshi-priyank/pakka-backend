import { Module } from '@nestjs/common'
import { OtpService } from './otp.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  // AutomationsModule exports EmailService; PrismaModule exports PrismaService.
  imports:   [PrismaModule, AutomationsModule],
  providers: [OtpService],
  exports:   [OtpService],
})
export class SharedModule {}
