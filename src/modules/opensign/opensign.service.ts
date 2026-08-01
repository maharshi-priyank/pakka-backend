import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateDocumentParams {
  pdfBuffer:          Buffer;
  signerEmail:        string;
  signerName:         string;
  contractTitle:      string;
  completionBaseUrl?: string;
}

export interface CreateDocumentResult {
  documentId: string;
  signingUrl: string;
}

@Injectable()
export class OpenSignService {
  private readonly logger = new Logger(OpenSignService.name);
  private readonly serverUrl: string;
  private readonly appId: string;
  private readonly masterKey: string;
  readonly publicUrl: string;

  // Cached session token — refreshed automatically via login()
  private sessionToken = '';

  constructor(private readonly config: ConfigService) {
    this.serverUrl = config.get<string>('opensign.serverUrl') ?? 'http://localhost:8080/app';
    this.appId     = config.get<string>('opensign.appId')     ?? 'opensign';
    this.masterKey = config.get<string>('opensign.masterKey') ?? '';
    this.publicUrl = config.get<string>('opensign.publicUrl') ?? 'http://localhost:3002';
  }

  get isEnabled(): boolean {
    return this.config.get<boolean>('opensign.enabled') === true && !!this.masterKey;
  }

  // Master-key headers — for file uploads and direct class reads
  private masterHeaders(): Record<string, string> {
    return {
      'X-Parse-Application-Id': this.appId,
      'X-Parse-Master-Key':     this.masterKey,
      'Content-Type':           'application/json',
    };
  }

  // Session-token headers — for cloud functions that check request.user
  // Do NOT include master key here; Parse ignores session token when master key is present
  private userHeaders(sessionToken: string): Record<string, string> {
    return {
      'X-Parse-Application-Id': this.appId,
      'X-Parse-Session-Token':  sessionToken,
      'Content-Type':           'application/json',
    };
  }

  private async ensureSession(): Promise<string> {
    // Try cached token first (session-only headers — no master key)
    if (this.sessionToken) {
      const res = await fetch(`${this.serverUrl}/users/me`, {
        headers: {
          'X-Parse-Application-Id': this.appId,
          'X-Parse-Session-Token':  this.sessionToken,
        },
      });
      if (res.ok) return this.sessionToken;
      this.logger.warn('OpenSign session token expired — re-logging in');
      this.sessionToken = '';
    }

    // Login with credentials
    const email    = this.config.get<string>('opensign.email')    ?? '';
    const password = this.config.get<string>('opensign.password') ?? '';

    if (!email || !password) {
      throw new BadRequestException(
        'OPENSIGN_EMAIL and OPENSIGN_PASSWORD must be set in .env to authenticate.',
      );
    }

    const loginRes = await fetch(
      `${this.serverUrl}/login?username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      { headers: { 'X-Parse-Application-Id': this.appId } },
    );

    if (!loginRes.ok) {
      const err = await loginRes.text();
      throw new InternalServerErrorException(`OpenSign login failed: ${err}`);
    }

    const data = await loginRes.json();
    this.sessionToken = data.sessionToken;
    this.logger.log(`OpenSign: logged in as ${email}`);
    return this.sessionToken;
  }

  async createDocument(params: CreateDocumentParams): Promise<CreateDocumentResult> {
    const { pdfBuffer, signerEmail, signerName, contractTitle, completionBaseUrl } = params;

    if (!this.masterKey) {
      throw new BadRequestException('OPENSIGN_MASTER_KEY is not set.');
    }

    const sessionToken = await this.ensureSession();

    // Step 1: Get _User (for objectId) then resolve contracts_Users record (for ExtUserPtr)
    const meRes = await fetch(`${this.serverUrl}/users/me`, {
      headers: this.userHeaders(sessionToken),
    });
    if (!meRes.ok) throw new InternalServerErrorException('OpenSign: could not get current user');
    const me = await meRes.json();

    // contracts_Users is a separate class linked to _User via UserId pointer
    const cuRes = await fetch(
      `${this.serverUrl}/classes/contracts_Users?where=${encodeURIComponent(JSON.stringify({ UserId: { __type: 'Pointer', className: '_User', objectId: me.objectId } }))}`,
      { headers: this.masterHeaders() },
    );
    const cuData = cuRes.ok ? await cuRes.json() : { results: [] };
    const contractsUserId: string = cuData.results?.[0]?.objectId ?? me.objectId;

    // Step 2: Upload PDF as a Parse File (master key is fine here — no user context needed)
    const fileName = `${contractTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    const fileRes = await fetch(`${this.serverUrl}/files/${encodeURIComponent(fileName)}`, {
      method: 'POST',
      headers: {
        'X-Parse-Application-Id': this.appId,
        'X-Parse-Master-Key':     this.masterKey,
        'Content-Type':           'application/pdf',
      },
      body: pdfBuffer as unknown as BodyInit,
    });
    if (!fileRes.ok) {
      const err = await fileRes.text();
      throw new InternalServerErrorException(`OpenSign file upload failed: ${err}`);
    }
    const fileData = await fileRes.json();
    const fileUrl: string = fileData.url;

    this.logger.log(`OpenSign: uploaded PDF → ${fileUrl}`);

    // Step 3: Create a contracts_Signers record for the external signer
    const signerRes = await fetch(`${this.serverUrl}/classes/contracts_Signers`, {
      method: 'POST',
      headers: this.userHeaders(sessionToken),
      body: JSON.stringify({ Name: signerName, Email: signerEmail, Phone: '' }),
    });
    let signerObjectId: string | null = null;
    if (signerRes.ok) {
      const sd = await signerRes.json();
      signerObjectId = sd.objectId;
    }

    // Placeholder describes who signs and where the signature widget goes.
    // The real structure the OpenSign frontend renders is placeHolder[].pos[] with
    // xPosition/yPosition/Width/Height/key — NOT a flat widgets[] array.
    // We place the signature widget on page 2 (the dedicated signature page of our PDF).
    const randKey = () => Math.random().toString(36).slice(2, 9);
    const placeholder: Record<string, unknown> = {
      email:       signerEmail,
      name:        signerName,
      Role:        'signer',
      signerObjId: signerObjectId,
      Id:          randKey(),
      blockColor:  '#93a3db',
      placeHolder: [
        {
          pageNumber: 2,
          pos: [
            {
              type:      'signature',
              xPosition: 50,
              yPosition: 100,
              Width:     200,
              Height:    50,
              key:       randKey(),
              options:   { status: 'required', name: 'Signature' },
            },
            {
              type:      'date',
              xPosition: 300,
              yPosition: 100,
              Width:     150,
              Height:    30,
              key:       randKey(),
              options:   { status: 'optional', name: 'Date' },
            },
          ],
        },
      ],
    };

    // Signers = contracts_Users pointers (the owners/admins who sent it).
    // The afterSave hook iterates this to set ACL — expects contracts_Users, not contracts_Signers.
    const docPayload = {
      document: {
        Name:        contractTitle,
        URL:         fileUrl,
        SignedUrl:   fileUrl,
        Note:        '',
        Description: contractTitle,
        SentToOthers: true,
        SendinOrder:  false,
        IsEnableOTP:  false,
        TimeToCompleteDays: 30,
        ExtUserPtr: {
          __type:    'Pointer',
          className: 'contracts_Users',
          objectId:  contractsUserId,
        },
        CreatedBy: {
          __type:    'Pointer',
          className: '_User',
          objectId:  me.objectId,
        },
        // Signers = contracts_Users owners (for ACL), Placeholders = actual external signers
        Signers: [
          { __type: 'Pointer', className: 'contracts_Users', objectId: contractsUserId },
        ],
        Placeholders: [placeholder],
      },
    };

    // Step 4: Create document — session-only so request.user is populated
    const docRes = await fetch(`${this.serverUrl}/functions/createdocumentfromapp`, {
      method: 'POST',
      headers: this.userHeaders(sessionToken),
      body: JSON.stringify(docPayload),
    });

    if (!docRes.ok) {
      const errText = await docRes.text();
      this.logger.error(`OpenSign createdocumentfromapp error [${docRes.status}]: ${errText}`);
      throw new InternalServerErrorException(`OpenSign document creation failed: ${errText}`);
    }

    const docData = await docRes.json();
    const documentId: string = docData.result?.objectId;

    if (!documentId) {
      throw new InternalServerErrorException(`OpenSign returned no documentId: ${JSON.stringify(docData)}`);
    }

    // Build signing URL: /login/base64(docId/email[/signerId])
    const token = signerObjectId
      ? Buffer.from(`${documentId}/${signerEmail}/${signerObjectId}`).toString('base64')
      : Buffer.from(`${documentId}/${signerEmail}`).toString('base64');
    const signingUrl = `${this.publicUrl}/login/${token}`;

    // Patch document with redirect URL now that we have the documentId
    if (completionBaseUrl) {
      const redirectUrl = `${completionBaseUrl}?docId=${documentId}`;
      await fetch(`${this.serverUrl}/classes/contracts_Document/${documentId}`, {
        method: 'PUT',
        headers: this.userHeaders(sessionToken),
        body: JSON.stringify({ RedirectUrl: redirectUrl }),
      }).catch(err => this.logger.warn(`Could not set RedirectUrl: ${err.message}`));
      this.logger.log(`OpenSign RedirectUrl set to ${redirectUrl}`);
    }

    this.logger.log(`OpenSign document created: id=${documentId}, signingUrl=${signingUrl}`);

    return { documentId, signingUrl };
  }

  async getDocument(documentId: string): Promise<any> {
    const res = await fetch(`${this.serverUrl}/classes/contracts_Document/${documentId}`, {
      headers: this.masterHeaders(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new InternalServerErrorException(`OpenSign getDocument failed: ${err}`);
    }
    return res.json();
  }

  async downloadSignedPdf(url: string): Promise<Buffer> {
    this.logger.log(`Downloading signed PDF from: ${url}`);
    const res = await fetch(url, { headers: this.masterHeaders() });
    if (!res.ok) {
      throw new InternalServerErrorException(`Failed to download signed PDF [${res.status}]`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
