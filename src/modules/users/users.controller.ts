import { Controller, Get, Post, Patch, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpsertUserDto } from './dto/upsert-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('me')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert user on first login (called from frontend after Supabase auth)' })
  upsert(@Body() dto: UpsertUserDto) {
    return this.usersService.upsert(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  getMe(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: User, @Body() dto: Partial<UpsertUserDto>) {
    return this.usersService.update(user.id, dto);
  }
}
