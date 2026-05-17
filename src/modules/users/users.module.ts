import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AutomationsModule } from '../automations/automations.module';

@Module({
  imports:     [AutomationsModule],
  controllers: [UsersController],
  providers:   [UsersService],
  exports:     [UsersService],
})
export class UsersModule {}
