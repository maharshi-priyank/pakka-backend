import { Global, Module } from '@nestjs/common';
import { NewRelicService } from './newrelic.service.js';

@Global()
@Module({
  providers: [NewRelicService],
  exports: [NewRelicService],
})
export class NewRelicModule {}
