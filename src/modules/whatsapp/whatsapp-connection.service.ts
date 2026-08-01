import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { encryptKey, decryptKey } from '../lead-vault/vault-crypto.util'

export interface WhatsappConnectionStatus {
  connected:   boolean
  displayPhone?: string
  connectedAt?:  Date
}

export interface DecryptedConnection {
  token:         string
  phoneNumberId: string
}

@Injectable()
export class WhatsappConnectionService {
  private readonly logger = new Logger(WhatsappConnectionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get encKey(): string {
    const key = this.config.get<string>('VAULT_ENCRYPTION_KEY')
    if (!key) throw new Error('VAULT_ENCRYPTION_KEY is not configured')
    return key
  }

  // ─── Public: connect via Embedded Signup code ─────────────────────────────

  async connect(workspaceId: string, code: string): Promise<{ connected: boolean; displayPhone: string }> {
    // TODO(WhatsApp): Uncomment the block below once the ClearWork Meta App is
    // registered, business verification is complete, and the following env vars
    // are set in production:
    //   WHATSAPP_APP_ID        — Meta App ID
    //   WHATSAPP_APP_SECRET    — Meta App Secret
    //
    // --- UNCOMMENT START ---
    // const appId     = this.config.get<string>('WHATSAPP_APP_ID')
    // const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET')
    // if (!appId || !appSecret) throw new BadRequestException('WhatsApp App credentials not configured')
    //
    // // 1. Exchange short-lived Embedded Signup code for a long-lived access token
    // const tokenRes = await fetch(
    //   `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`,
    // ).then(r => r.json() as Promise<{ access_token: string; token_type: string; error?: { message: string } }>)
    //
    // if (tokenRes.error) throw new BadRequestException(`Meta token exchange failed: ${tokenRes.error.message}`)
    //
    // // 2. Fetch WABA details (phone number ID, business account ID, display phone)
    // const wabaRes = await fetch(
    //   `https://graph.facebook.com/v19.0/me/whatsapp_business_accounts?access_token=${tokenRes.access_token}&fields=id,phone_numbers{id,display_phone_number}`,
    // ).then(r => r.json() as Promise<{ data: Array<{ id: string; phone_numbers: { data: Array<{ id: string; display_phone_number: string }> } }>; error?: { message: string } }>)
    //
    // if (wabaRes.error) throw new BadRequestException(`Meta WABA fetch failed: ${wabaRes.error.message}`)
    // if (!wabaRes.data?.length) throw new BadRequestException('No WhatsApp Business Account found on this Meta account')
    //
    // const waba        = wabaRes.data[0]
    // const phoneEntry  = waba.phone_numbers?.data?.[0]
    // if (!phoneEntry) throw new BadRequestException('No phone number found on the WhatsApp Business Account')
    //
    // const businessAccountId = waba.id
    // const phoneNumberId     = phoneEntry.id
    // const displayPhone      = phoneEntry.display_phone_number
    // const encrypted         = encryptKey(tokenRes.access_token, this.encKey)
    //
    // await this.prisma.whatsappConnection.upsert({
    //   where:  { workspaceId },
    //   create: { workspaceId, phoneNumberId, businessAccountId, encryptedAccessToken: encrypted, displayPhone, isActive: true },
    //   update: { phoneNumberId, businessAccountId, encryptedAccessToken: encrypted, displayPhone, isActive: true },
    // })
    //
    // this.logger.log(`[whatsapp] workspace=${workspaceId} connected phone=${displayPhone}`)
    // return { connected: true, displayPhone }
    // --- UNCOMMENT END ---

    throw new BadRequestException(
      'WhatsApp Business connection is coming soon. The ClearWork Meta App is pending registration.',
    )
  }

  // ─── Public: disconnect ────────────────────────────────────────────────────

  async disconnect(workspaceId: string): Promise<void> {
    const conn = await this.prisma.whatsappConnection.findUnique({ where: { workspaceId } })
    if (!conn) return

    // TODO(WhatsApp): Uncomment token revocation once Meta App is configured
    // try {
    //   const token = decryptKey(conn.encryptedAccessToken, this.encKey)
    //   await fetch(`https://graph.facebook.com/v19.0/${token}`, { method: 'DELETE' })
    // } catch (err) {
    //   this.logger.warn(`[whatsapp] token revocation failed for workspace=${workspaceId}: ${err}`)
    // }

    await this.prisma.whatsappConnection.delete({ where: { workspaceId } })
    this.logger.log(`[whatsapp] workspace=${workspaceId} disconnected`)
  }

  // ─── Public: status ────────────────────────────────────────────────────────

  async getStatus(workspaceId: string): Promise<WhatsappConnectionStatus> {
    const conn = await this.prisma.whatsappConnection.findUnique({ where: { workspaceId } })
    if (!conn) return { connected: false }
    return { connected: true, displayPhone: conn.displayPhone, connectedAt: conn.connectedAt }
  }

  // ─── Internal: decrypt token for message sending ──────────────────────────

  async getDecryptedToken(workspaceId: string): Promise<DecryptedConnection> {
    const conn = await this.prisma.whatsappConnection.findUnique({ where: { workspaceId } })
    if (!conn) throw new Error(`No WhatsApp connection for workspace=${workspaceId}`)
    const token = decryptKey(conn.encryptedAccessToken, this.encKey)
    return { token, phoneNumberId: conn.phoneNumberId }
  }
}
