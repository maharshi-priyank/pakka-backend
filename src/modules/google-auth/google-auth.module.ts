import { Module } from '@nestjs/common';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports:     [UsersModule],
  controllers: [GoogleAuthController],
  providers:   [GoogleAuthService],
  exports:     [GoogleAuthService],
})
export class GoogleAuthModule {}
