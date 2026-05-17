import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: QueryClientsDto) {
    return this.clientsService.findAll(user.id, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user.id, id, dto);
  }

  @Post(':id/regenerate-portal')
  regeneratePortalToken(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.regeneratePortalToken(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.remove(user.id, id);
  }
}
