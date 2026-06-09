import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PublicProfilesService } from './public-profiles.service';

@Injectable()
export class PublicProfilesScheduler {
  constructor(private readonly service: PublicProfilesService) {}

  // 2am UTC daily
  @Cron('0 2 * * *')
  async recalculateAllStats() {
    await this.service.recalculateStats();
  }
}
