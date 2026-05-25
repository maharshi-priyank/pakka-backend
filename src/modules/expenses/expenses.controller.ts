import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { BillExpensesDto } from './dto/bill-expenses.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'List expenses' })
  findAll(@CurrentUser() user: User, @Query() query: QueryExpensesDto) {
    return this.svc.findAll(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Log an expense' })
  create(@CurrentUser() user: User, @Body() dto: CreateExpenseDto) {
    return this.svc.create(user.id, dto);
  }

  @Post('bill')
  @ApiOperation({ summary: 'Convert unbilled expenses to an invoice' })
  billExpenses(@CurrentUser() user: User, @Body() dto: BillExpensesDto) {
    return this.svc.billExpenses(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an expense' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.id, id);
  }
}
