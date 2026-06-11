import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsBoolean } from 'class-validator'

export class CreateBoardDto {
  @IsString() @IsNotEmpty() name: string
  @IsOptional() @IsString() projectId?: string
}

export class UpdateBoardDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string
  @IsOptional() @IsInt() @Min(0) position?: number
}

export class CreateColumnDto {
  @IsString() @IsNotEmpty() name: string
  @IsOptional() @IsBoolean() isDone?: boolean
  @IsOptional() @IsString() color?: string
}

export class UpdateColumnDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string
  @IsOptional() @IsInt() @Min(0) position?: number
  @IsOptional() @IsBoolean() isDone?: boolean
  @IsOptional() @IsString() color?: string
}

const DEFAULT_COLUMNS = [
  { name: 'To Do',       position: 0, isDone: false, color: null },
  { name: 'In Progress', position: 1, isDone: false, color: '#F59E0B' },
  { name: 'Done',        position: 2, isDone: true,  color: '#10B981' },
]

const BOARD_INCLUDE = {
  columns: {
    orderBy: { position: 'asc' as const },
    include: {
      tasks: {
        orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
        include: {
          project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
      },
    },
  },
}

@Injectable()
export class TaskBoardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, projectId?: string) {
    return this.prisma.taskBoard.findMany({
      where: { userId, projectId: projectId ?? null },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, position: true, projectId: true, createdAt: true },
    })
  }

  async create(userId: string, dto: CreateBoardDto) {
    return this.prisma.taskBoard.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        name: dto.name,
        columns: { create: DEFAULT_COLUMNS },
      },
      include: BOARD_INCLUDE,
    })
  }

  async findOne(userId: string, boardId: string) {
    const board = await this.prisma.taskBoard.findUnique({
      where: { id: boardId },
      include: BOARD_INCLUDE,
    })
    if (!board || board.userId !== userId) throw new NotFoundException('Board not found')
    return board
  }

  async update(userId: string, boardId: string, dto: UpdateBoardDto) {
    await this.assertOwner(userId, boardId)
    return this.prisma.taskBoard.update({
      where: { id: boardId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    })
  }

  async remove(userId: string, boardId: string) {
    await this.assertOwner(userId, boardId)
    const columns = await this.prisma.boardColumn.findMany({ where: { boardId }, select: { id: true } })
    const colIds  = columns.map((c: { id: string }) => c.id)
    if (colIds.length) {
      await this.prisma.task.updateMany({ where: { columnId: { in: colIds } }, data: { columnId: null } })
    }
    await this.prisma.taskBoard.delete({ where: { id: boardId } })
  }

  async createColumn(userId: string, boardId: string, dto: CreateColumnDto) {
    await this.assertOwner(userId, boardId)
    const maxPos = await this.prisma.boardColumn.aggregate({
      where: { boardId },
      _max: { position: true },
    })
    const position = (maxPos._max.position ?? -1) + 1
    return this.prisma.boardColumn.create({
      data: { boardId, name: dto.name, position, isDone: dto.isDone ?? false, color: dto.color ?? null },
    })
  }

  async updateColumn(userId: string, boardId: string, colId: string, dto: UpdateColumnDto) {
    await this.assertColumnOwner(userId, boardId, colId)
    if (dto.isDone === true) {
      await this.prisma.boardColumn.updateMany({
        where: { boardId, isDone: true, id: { not: colId } },
        data: { isDone: false },
      })
    }
    return this.prisma.boardColumn.update({
      where: { id: colId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.isDone !== undefined && { isDone: dto.isDone }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    })
  }

  async removeColumn(userId: string, boardId: string, colId: string) {
    await this.assertColumnOwner(userId, boardId, colId)
    await this.prisma.task.updateMany({ where: { columnId: colId }, data: { columnId: null } })
    await this.prisma.boardColumn.delete({ where: { id: colId } })
  }

  private async assertOwner(userId: string, boardId: string) {
    const board = await this.prisma.taskBoard.findUnique({ where: { id: boardId }, select: { userId: true } })
    if (!board || board.userId !== userId) throw new NotFoundException('Board not found')
  }

  private async assertColumnOwner(userId: string, boardId: string, colId: string) {
    const col = await this.prisma.boardColumn.findUnique({
      where: { id: colId },
      select: { boardId: true, board: { select: { userId: true } } },
    })
    if (!col || col.boardId !== boardId || col.board.userId !== userId) throw new NotFoundException('Column not found')
  }
}
