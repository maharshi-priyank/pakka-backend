import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { StageAdvanceService } from './stage-advance.service';

@Module({
  controllers: [ContactsController],
  providers:   [ContactsService, StageAdvanceService],
  exports:     [ContactsService],
})
export class ContactsModule {}
