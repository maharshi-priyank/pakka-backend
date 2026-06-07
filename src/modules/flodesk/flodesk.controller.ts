import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { FlodeskService } from './flodesk.service.js';
import { User } from '@prisma/client';

class ConnectFlodeskDto {
  @IsString()
  @MinLength(10)
  apiKey: string;
}

@ApiTags('flodesk')
@ApiBearerAuth()
@Controller('flodesk')
@UseGuards(JwtAuthGuard)
export class FlodeskController {
  constructor(private readonly flodesk: FlodeskService) {}

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate and save Flodesk API key' })
  async connect(@CurrentUser() user: User, @Body() dto: ConnectFlodeskDto) {
    await this.flodesk.validateAndSave(user.id, dto.apiKey);
    return { connected: true };
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect Flodesk integration' })
  async disconnect(@CurrentUser() user: User) {
    await this.flodesk.disconnect(user.id);
    return { success: true };
  }
}
