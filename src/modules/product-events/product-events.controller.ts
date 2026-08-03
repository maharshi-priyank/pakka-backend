import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { RecordProductEventDto } from './dto/record-product-event.dto';
import { ProductEventsService } from './product-events.service';

@ApiTags('product-events')
@ApiBearerAuth()
@Controller('product-events')
export class ProductEventsController {
  constructor(private readonly productEvents: ProductEventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Record an allowlisted product event for growth analytics' })
  record(@CurrentUser() user: User, @Body() dto: RecordProductEventDto) {
    return this.productEvents.record(user.id, dto, user.activeWorkspaceId ?? user.id);
  }
}
