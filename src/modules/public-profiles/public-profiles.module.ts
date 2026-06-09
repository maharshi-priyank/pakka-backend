import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PublicProfilesController } from './public-profiles.controller';
import { PublicProfilesService } from './public-profiles.service';
import { PublicProfilesScheduler } from './public-profiles.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [PublicProfilesController],
  providers: [PublicProfilesService, PublicProfilesScheduler],
})
export class PublicProfilesModule {}
