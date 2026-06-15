import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadProvidersRegistry } from '../lead-providers/provider-registry';
import { encryptKey, decryptKey } from './vault-crypto.util';
import { SaveKeyDto } from './dto/save-key.dto';

@Injectable()
export class LeadVaultService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly config:    ConfigService,
    private readonly registry:  LeadProvidersRegistry,
  ) {}

  private get encKey(): string {
    return this.config.get<string>('vaultEncryptionKey')!;
  }

  async list(userId: string) {
    const rows = await this.prisma.leadProviderKey.findMany({
      where: { userId },
      select: { provider: true, status: true, lastTestedAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const connectedProviders = new Set(rows.map(r => r.provider));
    const all = this.registry.catalog().map(p => ({
      ...p,
      connected: connectedProviders.has(p.provider),
      status: rows.find(r => r.provider === p.provider)?.status ?? null,
      lastTestedAt: rows.find(r => r.provider === p.provider)?.lastTestedAt ?? null,
    }));
    return all;
  }

  async save(userId: string, provider: string, dto: SaveKeyDto) {
    const adapter = this.registry.get(provider);
    if (!adapter) throw new BadRequestException(`Unknown provider: ${provider}`);

    const testResult = await adapter.testKey(dto.key);
    if (!testResult.valid) throw new BadRequestException(`Invalid API key: ${testResult.error ?? 'key rejected by provider'}`);

    const encrypted = encryptKey(dto.key, this.encKey);
    const row = await this.prisma.leadProviderKey.upsert({
      where:  { userId_provider: { userId, provider } },
      create: { userId, provider, encryptedKey: encrypted, status: 'active', lastTestedAt: new Date() },
      update: { encryptedKey: encrypted, status: 'active', lastTestedAt: new Date() },
      select: { provider: true, status: true, lastTestedAt: true },
    });
    return row;
  }

  async test(userId: string, provider: string) {
    const row = await this.prisma.leadProviderKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) throw new NotFoundException(`No key saved for provider: ${provider}`);

    const adapter = this.registry.get(provider);
    if (!adapter) throw new BadRequestException(`Unknown provider: ${provider}`);

    const rawKey = decryptKey(row.encryptedKey, this.encKey);
    const result = await adapter.testKey(rawKey);
    const status = result.valid ? 'active' : 'invalid';

    await this.prisma.leadProviderKey.update({
      where: { userId_provider: { userId, provider } },
      data: { status, lastTestedAt: new Date() },
    });
    return { provider, valid: result.valid, status, error: result.error };
  }

  async remove(userId: string, provider: string) {
    const row = await this.prisma.leadProviderKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) throw new NotFoundException(`No key saved for provider: ${provider}`);
    await this.prisma.leadProviderKey.delete({ where: { userId_provider: { userId, provider } } });
  }

  async getDecryptedKey(userId: string, provider: string): Promise<string | null> {
    const row = await this.prisma.leadProviderKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) return null;
    return decryptKey(row.encryptedKey, this.encKey);
  }
}
