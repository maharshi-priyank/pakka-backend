import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertUserDto } from './dto/upsert-user.dto';

const DEFAULT_AUTOMATION_RULES = [
  {
    trigger: 'proposal_accepted',
    action: 'generate_contract',
    config: { delayHours: 0 },
    isActive: true,
  },
  {
    trigger: 'contract_signed',
    action: 'generate_invoice',
    config: { delayHours: 0 },
    isActive: true,
  },
  {
    trigger: 'invoice_unpaid',
    action: 'send_reminder',
    config: { reminderDays: [3, 7, 14] },
    isActive: true,
  },
  {
    trigger: 'lead_cold',
    action: 'notify_user',
    config: { inactiveDays: 7 },
    isActive: true,
  },
  {
    trigger: 'new_enquiry_form',
    action: 'add_to_crm',
    config: {},
    isActive: false,
  },
];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(dto: UpsertUserDto) {
    const user = await this.prisma.user.upsert({
      where: { id: dto.id },
      update: {
        email: dto.email,
        name: dto.name,
        ...(dto.businessName && { businessName: dto.businessName }),
        ...(dto.businessType && { businessType: dto.businessType }),
        ...(dto.gstNumber && { gstNumber: dto.gstNumber }),
        ...(dto.panNumber && { panNumber: dto.panNumber }),
        ...(dto.logoUrl && { logoUrl: dto.logoUrl }),
      },
      create: {
        id: dto.id,
        email: dto.email,
        name: dto.name,
        businessName: dto.businessName,
        businessType: dto.businessType,
        gstNumber: dto.gstNumber,
        panNumber: dto.panNumber,
        logoUrl: dto.logoUrl,
        automationRules: {
          createMany: { data: DEFAULT_AUTOMATION_RULES },
        },
      },
    });

    return user;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async update(id: string, data: Partial<UpsertUserDto>) {
    return this.prisma.user.update({ where: { id }, data });
  }
}
