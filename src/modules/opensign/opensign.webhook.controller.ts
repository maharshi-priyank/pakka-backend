import {
  Controller, Post, Get, Body, HttpCode, Logger, Headers, Req, Res, Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { OpenSignService } from './opensign.service';
import { ContractStatus } from '@prisma/client';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';

@Controller('webhooks/opensign')
export class OpenSignWebhookController {
  private readonly logger = new Logger(OpenSignWebhookController.name);
  private readonly webhookSecret: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly config:       ConfigService,
    private readonly prisma:       PrismaService,
    private readonly opensign:     OpenSignService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.webhookSecret = config.get<string>('opensign.webhookSecret') ?? '';
    this.frontendUrl   = config.get<string>('app.frontendUrl') ?? 'http://localhost:5173';
  }

  /**
   * GET /webhooks/opensign/complete?docId=<opensignDocumentId>
   *
   * OpenSign calls this URL after a signer completes signing (set as RedirectUrl
   * on the document). We mark the contract signed, then redirect the browser to
   * the Pakka frontend so the signer sees the confirmation page.
   */
  @Public()
  @Get('complete')
  async handleComplete(
    @Query('docId') docId: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`OpenSign redirect received for docId=${docId}`);

    if (docId) {
      await this.processCompletion(docId).catch(err =>
        this.logger.error(`Error processing completion for ${docId}: ${err.message}`),
      );
    }

    // Always redirect browser to a friendly frontend page
    const contractId = docId
      ? await this.prisma.contract
          .findFirst({ where: { opensignDocumentId: docId }, select: { id: true } })
          .then(c => c?.id)
          .catch(() => undefined)
      : undefined;

    const destination = contractId
      ? `${this.frontendUrl}/contracts/${contractId}?signed=1`
      : `${this.frontendUrl}/contracts?signed=1`;

    res.redirect(302, destination);
  }

  /**
   * POST /webhooks/opensign
   * Kept for future webhook support (if OpenSign adds native webhooks).
   */
  @Public()
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: any,
    @Req() req: Request,
    @Headers('x-opensign-signature') hmacHeader?: string,
  ): Promise<{ received: boolean }> {
    if (this.webhookSecret && hmacHeader) {
      if (!this.verifyHmac(req, hmacHeader)) {
        this.logger.warn('OpenSign webhook received with invalid signature — ignoring');
        return { received: false };
      }
    }

    const eventType = payload?.event ?? payload?.type;
    this.logger.log(`OpenSign webhook received: ${eventType}`);

    const documentId: string =
      payload?.data?.documentId ??
      payload?.documentId ??
      payload?.data?.objectId ??
      payload?.objectId;

    if (
      eventType === 'document.completed' ||
      eventType === 'completed' ||
      payload?.data?.IsCompleted === true ||
      payload?.IsCompleted === true
    ) {
      if (documentId) await this.processCompletion(documentId, payload);
    }

    return { received: true };
  }

  // ─── Shared completion logic ──────────────────────────────────────────────────

  private async processCompletion(documentId: string, payload?: any): Promise<void> {
    const contract = await this.prisma.contract.findFirst({
      where: { opensignDocumentId: documentId },
    });

    if (!contract) {
      this.logger.warn(`No contract found for OpenSign document ${documentId}`);
      return;
    }

    if (contract.status === ContractStatus.SIGNED) {
      this.logger.log(`Contract ${contract.id} already signed — skipping`);
      return;
    }

    // Try to get signed PDF from OpenSign
    let signedPdfUrl: string | null = null;
    try {
      const doc = await this.opensign.getDocument(documentId);
      const pdfUrl: string | undefined = doc?.SignedPdfUrl ?? doc?.signedPdfUrl ?? doc?.SignedUrl;
      if (pdfUrl) {
        const pdfBuffer = await this.opensign.downloadSignedPdf(pdfUrl);
        signedPdfUrl = await this.uploadToSupabase(pdfBuffer, contract.id, contract.title);
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch/upload signed PDF for ${documentId}: ${err.message}`);
    }

    const auditLog = {
      signedAt:           new Date().toISOString(),
      method:             'OPENSIGN',
      opensignDocumentId: documentId,
    };

    await this.prisma.contract.update({
      where: { id: contract.id },
      data: {
        status:      ContractStatus.SIGNED,
        signedAt:    new Date(),
        signedPdfUrl,
        auditLog:    auditLog as object,
      },
    });

    this.logger.log(`Contract ${contract.id} marked SIGNED via OpenSign`);

    this.eventEmitter.emit('contract.signed', {
      entityId:    contract.id,
      workspaceId: contract.workspaceId,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private verifyHmac(req: Request, header: string): boolean {
    const rawBody: Buffer = (req as any).rawBody;
    if (!rawBody) return false;
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private async uploadToSupabase(pdfBuffer: Buffer, contractId: string, title: string): Promise<string> {
    const supabaseUrl    = this.config.getOrThrow<string>('supabase.url').trim();
    const serviceRoleKey = this.config.getOrThrow<string>('supabase.serviceRoleKey').trim();

    const safeName    = (title || 'contract').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const rand        = Math.random().toString(36).slice(2, 10);
    const storagePath = `attachments/opensign/${rand}-${safeName}.pdf`;
    const bucket      = 'deliverables';

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization':  `Bearer ${serviceRoleKey}`,
          'Content-Type':   'application/pdf',
          'Content-Length': String(pdfBuffer.byteLength),
          'x-upsert':       'false',
        },
        body: new Uint8Array(pdfBuffer),
        // @ts-ignore — duplex required by Node 18+
        duplex: 'half',
      },
    );

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      throw new Error(`Supabase upload failed [${uploadRes.status}]: ${errBody}`);
    }

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
  }
}
