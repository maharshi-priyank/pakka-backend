import { Module } from '@nestjs/common';
import { LeadsProxyService } from './leads-proxy.service';
import { LeadsProxyController } from './leads-proxy.controller';

@Module({
  providers: [LeadsProxyService],
  controllers: [LeadsProxyController],
  exports: [LeadsProxyService],
})
export class LeadsProxyModule {}
