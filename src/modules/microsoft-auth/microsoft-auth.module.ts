import { Module } from '@nestjs/common';
import { MicrosoftAuthController } from './microsoft-auth.controller.js';
import { MicrosoftAuthService } from './microsoft-auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports:     [UsersModule],
  controllers: [MicrosoftAuthController],
  providers:   [MicrosoftAuthService],
  exports:     [MicrosoftAuthService],
})
export class MicrosoftAuthModule {}
