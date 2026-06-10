import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleFormsController } from './google-forms.controller';
import { GoogleFormsService } from './google-forms.service';

@Module({
  imports:     [PrismaModule],
  controllers: [GoogleFormsController],
  providers:   [GoogleFormsService],
})
export class GoogleFormsModule {}
