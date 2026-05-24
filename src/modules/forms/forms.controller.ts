import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('forms')
@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  // ─── Public: fill a form by token ────────────────────────────────────────

  @Public()
  @Get('fill/:token')
  @ApiOperation({ summary: 'Get public form by token' })
  getByToken(@Param('token') token: string) {
    return this.formsService.findByToken(token);
  }

  @Public()
  @Post('fill/:token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a form response' })
  submit(@Param('token') token: string, @Body() dto: SubmitFormDto) {
    return this.formsService.submit(token, dto);
  }

  // ─── Protected: CRUD ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create a new intake form' })
  create(@CurrentUser() user: User, @Body() dto: CreateFormDto) {
    return this.formsService.create(user.id, dto);
  }

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List all intake forms' })
  findAll(@CurrentUser() user: User) {
    return this.formsService.findAll(user.id);
  }

  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get form with submissions' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.formsService.findOne(user.id, id);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update form' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.formsService.update(user.id, id, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete form' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.formsService.remove(user.id, id);
  }
}
