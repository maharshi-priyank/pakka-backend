import { Module } from '@nestjs/common'
import { ContactFormController } from './contact-form.controller'
import { ContactFormService } from './contact-form.service'

@Module({
  controllers: [ContactFormController],
  providers: [ContactFormService],
})
export class ContactFormModule {}
