import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LeadVaultService } from './lead-vault.service';
import { SaveKeyDto } from './dto/save-key.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('lead-vault')
@ApiBearerAuth()
@Controller('lead-vault')
export class LeadVaultController {
  constructor(private readonly service: LeadVaultService) {}

  @Get()
  @ApiOperation({ summary: 'List all providers with connection status' })
  list(@CurrentUser() user: User) {
    return this.service.list(user.id);
  }

  @Post(':provider')
  @ApiOperation({ summary: 'Save & validate an API key for a provider' })
  save(@CurrentUser() user: User, @Param('provider') provider: string, @Body() dto: SaveKeyDto) {
    return this.service.save(user.id, provider, dto);
  }

  @Post(':provider/test')
  @ApiOperation({ summary: 'Re-test an existing saved key' })
  test(@CurrentUser() user: User, @Param('provider') provider: string) {
    return this.service.test(user.id, provider);
  }

  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a saved key' })
  remove(@CurrentUser() user: User, @Param('provider') provider: string) {
    return this.service.remove(user.id, provider);
  }
}
