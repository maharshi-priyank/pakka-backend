import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
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

  @Get('categories')
  @ApiOperation({ summary: 'Get available expense categories' })
  async getCategories(@CurrentUser() user: User) {
    const categories = await this.svc.getCategories(user.id);
    return { data: categories };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export expenses as CSV' })
  async exportCsv(
    @CurrentUser() user: User,
    @Query() query: QueryExpensesDto,
    @Res() res: Response,
  ) {
    const csv = await this.svc.exportCsv(user.id, query);
    const label = query.from && query.to
      ? `${query.from}_to_${query.to}`
      : 'all';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${label}.csv"`);
    res.send(csv);
  }

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
