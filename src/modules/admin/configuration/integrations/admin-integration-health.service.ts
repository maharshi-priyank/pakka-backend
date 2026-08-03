import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';

export type AdminIntegrationProvider = 'whatsapp' | 'email';

@Injectable()
export class AdminIntegrationHealthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async overview() {
    const [workspaces, connections, communication] = await Promise.all([
      this.prisma.workspace.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
      this.prisma.whatsappConnection.findMany({ select: { workspaceId: true, displayPhone: true, isActive: true, connectedAt: true, updatedAt: true } }),
      this.prisma.communicationLog.groupBy({ by: ['channel', 'status'], _count: { _all: true } }),
    ]);
    const connectionByWorkspace = new Map(connections.map((connection) => [connection.workspaceId, connection]));
    const whatsapp = workspaces.map((workspace) => {
      const connection = connectionByWorkspace.get(workspace.id);
      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        connected: Boolean(connection),
        active: connection?.isActive ?? false,
        displayPhone: connection?.displayPhone ?? null,
        connectedAt: connection?.connectedAt ?? null,
        updatedAt: connection?.updatedAt ?? null,
        stale: Boolean(connection && connection.updatedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      };
    });
    return {
      providers: {
        whatsapp: { connected: whatsapp.filter((item) => item.connected && item.active).length, inactive: whatsapp.filter((item) => item.connected && !item.active).length, configured: whatsapp.length },
        email: { configured: this.emailConfigured(), delivery: this.communicationSummary(communication, 'EMAIL') },
      },
      communication: communication.map((item) => ({ channel: item.channel, status: item.status, count: item._count._all })),
      whatsapp: whatsapp.slice(0, 500),
      dataQuality: { whatsappProviderHealthCheckAvailable: false as const, emailTransportHealthCheckAvailable: false as const },
    };
  }

  async details(provider: AdminIntegrationProvider, workspaceId?: string) {
    if (provider === 'whatsapp') {
      const connections = await this.prisma.whatsappConnection.findMany({
        where: workspaceId ? { workspaceId } : { workspace: { archivedAt: null } },
        select: { workspaceId: true, workspace: { select: { name: true } }, displayPhone: true, isActive: true, connectedAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      });
      return connections.map((connection) => ({ workspaceId: connection.workspaceId, workspaceName: connection.workspace.name, connected: true, displayPhone: connection.displayPhone, active: connection.isActive, connectedAt: connection.connectedAt, updatedAt: connection.updatedAt, stale: connection.updatedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }));
    }
    const logs = await this.prisma.communicationLog.groupBy({
      by: ['workspaceId', 'status'],
      where: workspaceId ? { workspaceId, channel: 'EMAIL' } : { channel: 'EMAIL' },
      _count: { _all: true },
    });
    return { configured: this.emailConfigured(), workspaceId: workspaceId ?? null, delivery: logs.map((item) => ({ status: item.status, count: item._count._all })) };
  }

  async check(provider: AdminIntegrationProvider, workspaceId: string) {
    if (provider !== 'whatsapp' && provider !== 'email') throw new BadRequestException('Unsupported integration provider.');
    return { provider, workspaceId, checkedAt: new Date().toISOString(), ...(await this.details(provider, workspaceId)) };
  }

  private emailConfigured() {
    return Boolean(this.config.get<string>('SMTP_HOST') || this.config.get<string>('smtp.host'));
  }

  private communicationSummary(rows: Array<{ channel: string; status: string; _count: { _all: number } }>, channel: string) {
    return rows.filter((row) => row.channel === channel).reduce<Record<string, number>>((summary, row) => { summary[row.status] = row._count._all; return summary; }, {});
  }
}
