import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAuthService } from '../google-auth/google-auth.service';

// ─── Sheet tab names ──────────────────────────────────────────────────────────

export const SHEET = {
  LEADS:     'Leads',
  CLIENTS:   'Clients',
  REVENUE:   'Revenue',
  PROPOSALS: 'Proposals',
} as const;

// ─── Column headers per sheet ─────────────────────────────────────────────────

const HEADERS: Record<string, string[]> = {
  [SHEET.LEADS]:     ['ID', 'Name', 'Email', 'Phone', 'Company', 'Service', 'Budget (₹)', 'Stage', 'Source', 'Created At', 'Updated At'],
  [SHEET.CLIENTS]:   ['ID', 'Name', 'Email', 'Phone', 'Company', 'GST Number', 'Created At'],
  [SHEET.REVENUE]:   ['Invoice #', 'Client', 'Subtotal (₹)', 'GST (₹)', 'Total (₹)', 'Status', 'Sent At', 'Paid At', 'Due Date'],
  [SHEET.PROPOSALS]: ['ID', 'Title', 'Client', 'Total (₹)', 'Status', 'Sent At', 'Accepted At'],
};

// ─── Styling constants ────────────────────────────────────────────────────────

type RGB = { red: number; green: number; blue: number };

const C: Record<string, RGB> = {
  headerBg:    { red: 0.086, green: 0.133, blue: 0.220 },  // #162236 deep navy
  headerText:  { red: 1.000, green: 1.000, blue: 1.000 },  // white
  evenRow:     { red: 0.953, green: 0.969, blue: 0.988 },  // #F3F7FC
  oddRow:      { red: 1.000, green: 1.000, blue: 1.000 },  // white
  border:      { red: 0.824, green: 0.843, blue: 0.878 },  // #D2D7E0

  green:       { red: 0.780, green: 0.953, blue: 0.792 },  // #C7F3CA
  greenText:   { red: 0.078, green: 0.400, blue: 0.133 },  // #146622
  red:         { red: 0.988, green: 0.816, blue: 0.816 },  // #FCD0D0
  redText:     { red: 0.600, green: 0.082, blue: 0.082 },  // #991515
  blue:        { red: 0.796, green: 0.898, blue: 0.988 },  // #CBE5FC
  blueText:    { red: 0.082, green: 0.369, blue: 0.651 },  // #155EA6
  orange:      { red: 0.996, green: 0.918, blue: 0.784 },  // #FEEAD8 (softer)
  orangeText:  { red: 0.651, green: 0.349, blue: 0.027 },  // #A65907
  yellow:      { red: 0.996, green: 0.976, blue: 0.796 },  // #FEF9CB
  yellowText:  { red: 0.510, green: 0.431, blue: 0.000 },  // #826E00
  grey:        { red: 0.922, green: 0.922, blue: 0.922 },  // #EBEBEB
  greyText:    { red: 0.365, green: 0.365, blue: 0.365 },  // #5D5D5D
  purple:      { red: 0.922, green: 0.855, blue: 0.988 },  // #EBDAFC
  purpleText:  { red: 0.400, green: 0.102, blue: 0.651 },  // #661AA6
};

const TAB_COLOR: Record<string, RGB> = {
  [SHEET.LEADS]:     { red: 0.259, green: 0.522, blue: 0.957 },  // Google Blue
  [SHEET.CLIENTS]:   { red: 0.204, green: 0.659, blue: 0.325 },  // Google Green
  [SHEET.REVENUE]:   { red: 0.984, green: 0.431, blue: 0.000 },  // Google Orange
  [SHEET.PROPOSALS]: { red: 0.612, green: 0.153, blue: 0.690 },  // Purple
};

// Column pixel widths per sheet (matches HEADERS order)
const COL_WIDTHS: Record<string, number[]> = {
  [SHEET.LEADS]:     [224, 156, 204, 136, 164, 164, 116, 110, 120, 184, 184],
  [SHEET.CLIENTS]:   [224, 156, 204, 136, 164, 140, 184],
  [SHEET.REVENUE]:   [128, 164, 128, 108, 128, 108, 184, 184, 140],
  [SHEET.PROPOSALS]: [224, 204, 164, 128, 108, 184, 184],
};

// Conditional formatting rules per sheet: { colIndex, rules[] }
type CFRule = { value: string; bg: RGB; fg: RGB };

const CF_RULES: Record<string, { col: number; rules: CFRule[] }> = {
  [SHEET.LEADS]: {
    col: 7,
    rules: [
      { value: 'WON',           bg: C.green,  fg: C.greenText  },
      { value: 'ONBOARDED',     bg: C.green,  fg: C.greenText  },
      { value: 'LOST',          bg: C.red,    fg: C.redText    },
      { value: 'NEGOTIATION',   bg: C.yellow, fg: C.yellowText },
      { value: 'PROPOSAL_SENT', bg: C.orange, fg: C.orangeText },
      { value: 'ENQUIRY',       bg: C.blue,   fg: C.blueText   },
      { value: 'QUALIFIED',     bg: C.purple, fg: C.purpleText },
    ],
  },
  [SHEET.REVENUE]: {
    col: 5,
    rules: [
      { value: 'PAID',      bg: C.green,  fg: C.greenText  },
      { value: 'OVERDUE',   bg: C.red,    fg: C.redText    },
      { value: 'CANCELLED', bg: C.red,    fg: C.redText    },
      { value: 'PARTIAL',   bg: C.orange, fg: C.orangeText },
      { value: 'SENT',      bg: C.blue,   fg: C.blueText   },
      { value: 'DRAFT',     bg: C.grey,   fg: C.greyText   },
    ],
  },
  [SHEET.PROPOSALS]: {
    col: 4,
    rules: [
      { value: 'ACCEPTED', bg: C.green,  fg: C.greenText  },
      { value: 'DECLINED', bg: C.red,    fg: C.redText    },
      { value: 'VIEWED',   bg: C.yellow, fg: C.yellowText },
      { value: 'SENT',     bg: C.blue,   fg: C.blueText   },
      { value: 'DRAFT',    bg: C.grey,   fg: C.greyText   },
    ],
  },
};

// ─── Date formatters ──────────────────────────────────────────────────────────

const fmtDate = (d: any): string => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const fmtDateTime = (d: any): string => {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

// ─── Style request builders ───────────────────────────────────────────────────

function buildStyleRequests(
  sheetInfos: Array<{ sheetId: number; title: string }>,
): any[] {
  const reqs: any[] = [];

  for (const { sheetId, title } of sheetInfos) {
    const colCount = HEADERS[title]?.length ?? 10;
    const widths   = COL_WIDTHS[title] ?? [];
    const tabColor = TAB_COLOR[title as keyof typeof TAB_COLOR];

    // 1. Tab color
    if (tabColor) {
      reqs.push({
        updateSheetProperties: {
          properties: { sheetId, tabColorStyle: { rgbColor: tabColor } },
          fields: 'tabColorStyle',
        },
      });
    }

    // 2. Freeze header
    reqs.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    // 3. Default cell style for entire sheet (font + vertical alignment)
    reqs.push({
      repeatCell: {
        range: { sheetId },
        cell: {
          userEnteredFormat: {
            textFormat:         { fontFamily: 'Arial', fontSize: 10 },
            verticalAlignment:  'MIDDLE',
            wrapStrategy:       'CLIP',
          },
        },
        fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)',
      },
    });

    // 4. Header row — dark navy, white bold centered text
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: {
          userEnteredFormat: {
            backgroundColor:    C.headerBg,
            textFormat:         { fontFamily: 'Arial', fontSize: 10, bold: true, foregroundColor: C.headerText },
            horizontalAlignment:'CENTER',
            verticalAlignment:  'MIDDLE',
            wrapStrategy:       'CLIP',
            padding:            { top: 0, bottom: 0, left: 8, right: 8 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,padding)',
      },
    });

    // 5. Header row height
    reqs.push({
      updateDimensionProperties: {
        range:      { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 44 },
        fields:     'pixelSize',
      },
    });

    // 6. Data row height (rows 2–500)
    reqs.push({
      updateDimensionProperties: {
        range:      { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 500 },
        properties: { pixelSize: 34 },
        fields:     'pixelSize',
      },
    });

    // 7. Banded rows for data (alternating white / light blue-grey)
    reqs.push({
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
          rowProperties: {
            firstBandColor:  C.oddRow,
            secondBandColor: C.evenRow,
          },
        },
      },
    });

    // 8. Bottom border on header row (accent line)
    reqs.push({
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
        bottom: {
          style: 'SOLID_MEDIUM',
          colorStyle: { rgbColor: { red: 0.259, green: 0.522, blue: 0.957 } },
        },
      },
    });

    // 9. Column widths
    for (let i = 0; i < widths.length; i++) {
      reqs.push({
        updateDimensionProperties: {
          range:      { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: widths[i] },
          fields:     'pixelSize',
        },
      });
    }

    // 10. Conditional formatting for Stage / Status columns
    const cf = CF_RULES[title];
    if (cf) {
      cf.rules.forEach(({ value, bg, fg }, idx) => {
        reqs.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startColumnIndex: cf.col, endColumnIndex: cf.col + 1, startRowIndex: 1 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
                format: {
                  backgroundColor: bg,
                  textFormat: { foregroundColor: fg, bold: true },
                },
              },
            },
            index: idx,
          },
        });
      });
    }
  }

  return reqs;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(
    private readonly prisma:     PrismaService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // ─── Connect: create spreadsheet + write headers + apply styling ──────────

  async connect(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true },
    });

    const auth   = await this.googleAuth.getAuthorizedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Create spreadsheet with 4 named tabs
    const { data } = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `ClearWork — ${user?.email ?? userId}` },
        sheets: Object.values(SHEET).map((title) => ({
          properties: { title },
        })),
      },
    });

    const spreadsheetId = data.spreadsheetId!;

    // Write header rows
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: Object.entries(HEADERS).map(([sheetName, headers]) => ({
          range:  `${sheetName}!A1`,
          values: [headers],
        })),
      },
    });

    // Extract sheet IDs in order (same order as Object.values(SHEET))
    const sheetInfos = (data.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title:   s.properties?.title   ?? '',
    }));

    // Apply all styling in a single batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: buildStyleRequests(sheetInfos) },
    });

    // Persist to DB
    await this.prisma.user.update({
      where: { id: userId },
      data:  { googleSheetsConnected: true, googleSheetsId: spreadsheetId },
    });

    return spreadsheetId;
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { googleSheetsConnected: false, googleSheetsId: null },
    });
  }

  // ─── Get sheet URL ────────────────────────────────────────────────────────

  async getSheetUrl(userId: string): Promise<{ url: string } | null> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { googleSheetsId: true, googleSheetsConnected: true },
    });
    if (!user?.googleSheetsConnected || !user.googleSheetsId) return null;
    return { url: `https://docs.google.com/spreadsheets/d/${user.googleSheetsId}` };
  }

  // ─── Append a row ────────────────────────────────────────────────────────

  async appendRow(userId: string, sheetName: string, row: (string | number | null)[]): Promise<void> {
    const spreadsheetId = await this.getSheetId(userId);
    if (!spreadsheetId) return;

    try {
      const auth   = await this.googleAuth.getAuthorizedClient(userId);
      const sheets = google.sheets({ version: 'v4', auth });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range:            `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody:      { values: [row] },
      });
    } catch (err) {
      this.logger.error(`appendRow failed for user ${userId} sheet ${sheetName}`, err);
    }
  }

  // ─── Update existing row by matching column A (ID) ───────────────────────

  async updateRowById(
    userId: string,
    sheetName: string,
    id: string,
    row: (string | number | null)[],
  ): Promise<void> {
    const spreadsheetId = await this.getSheetId(userId);
    if (!spreadsheetId) return;

    try {
      const auth   = await this.googleAuth.getAuthorizedClient(userId);
      const sheets = google.sheets({ version: 'v4', auth });

      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:A`,
      });

      const rows   = data.values ?? [];
      const rowIdx = rows.findIndex((r) => r[0] === id);

      if (rowIdx === -1) {
        await this.appendRow(userId, sheetName, row);
        return;
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range:            `${sheetName}!A${rowIdx + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody:      { values: [row] },
      });
    } catch (err) {
      this.logger.error(`updateRowById failed for user ${userId} sheet ${sheetName} id ${id}`, err);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getSheetId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { googleSheetsConnected: true, googleSheetsId: true },
    });
    if (!user?.googleSheetsConnected || !user.googleSheetsId) return null;
    return user.googleSheetsId;
  }

  // ─── Row builders ─────────────────────────────────────────────────────────

  buildLeadRow(lead: any): (string | number | null)[] {
    return [
      lead.id,
      lead.name               ?? '',
      lead.email              ?? '',
      lead.phone              ?? '',
      lead.company            ?? '',
      lead.service            ?? '',
      lead.budget != null ? Number(lead.budget) : '',
      lead.stage              ?? '',
      lead.source             ?? '',
      fmtDateTime(lead.createdAt),
      fmtDateTime(lead.updatedAt),
    ];
  }

  buildClientRow(client: any): (string | number | null)[] {
    return [
      client.id,
      client.name      ?? '',
      client.email     ?? '',
      client.phone     ?? '',
      client.company   ?? '',
      client.gstNumber ?? '',
      fmtDateTime(client.createdAt),
    ];
  }

  buildInvoiceRow(invoice: any): (string | number | null)[] {
    return [
      invoice.invoiceNumber ?? invoice.id,
      invoice.client?.name  ?? '',
      invoice.subtotal  != null ? Number(invoice.subtotal)  : '',
      invoice.gstAmount != null ? Number(invoice.gstAmount) : '',
      invoice.total     != null ? Number(invoice.total)     : '',
      invoice.status    ?? '',
      fmtDateTime(invoice.createdAt),
      fmtDateTime(invoice.paidAt),
      fmtDate(invoice.dueDate),
    ];
  }

  buildProposalRow(proposal: any): (string | number | null)[] {
    return [
      proposal.id,
      proposal.title        ?? '',
      proposal.client?.name ?? '',
      proposal.totalAmount  != null ? Number(proposal.totalAmount) : '',
      proposal.status       ?? '',
      fmtDateTime(proposal.sentAt),
      fmtDateTime(proposal.acceptedAt),
    ];
  }
}
