import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly eventEmitter:  EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateFormDto) {
    return this.prisma.intakeForm.create({
      data: {
        title:       dto.title,
        description: dto.description,
        fields:      (dto.fields ?? []) as unknown as object[],
        userId,
        token:       nanoid(21),
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.intakeForm.findMany({
      where:   { userId },
      include: { _count: { select: { submissions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const form = await this.prisma.intakeForm.findFirst({
      where:   { id, userId },
      include: {
        submissions: { orderBy: { submittedAt: 'desc' } },
        _count:      { select: { submissions: true } },
      },
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async findByToken(token: string) {
    const form = await this.prisma.intakeForm.findUnique({
      where:   { token },
      include: {
        user: { select: { businessName: true, name: true, logoUrl: true } },
      },
    });
    if (!form) throw new NotFoundException('Form not found');
    return {
      id:          form.id,
      title:       form.title,
      description: form.description,
      fields:      form.fields,
      isActive:    form.isActive,
      user:        form.user,
    };
  }

  async update(userId: string, id: string, dto: UpdateFormDto) {
    await this.findOne(userId, id);
    return this.prisma.intakeForm.update({
      where: { id },
      data:  {
        ...dto,
        fields: dto.fields !== undefined ? (dto.fields as unknown as object[]) : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.intakeForm.delete({ where: { id } });
  }

  async submit(token: string, dto: SubmitFormDto) {
    const form = await this.prisma.intakeForm.findUnique({ where: { token } });
    if (!form) throw new NotFoundException('Form not found');
    if (!form.isActive) throw new BadRequestException('This form is no longer accepting responses');

    const submission = await this.prisma.intakeFormSubmission.create({
      data: {
        formId:          form.id,
        respondentName:  dto.respondentName,
        respondentEmail: dto.respondentEmail,
        answers:         dto.answers as unknown as object,
      },
    });

    this.eventEmitter.emit('form.submitted', {
      entityId: form.id,
      userId:   form.userId,
      formId:   form.id,
    });

    return submission;
  }
}
