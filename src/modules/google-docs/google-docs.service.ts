import { Injectable, NotFoundException } from '@nestjs/common';
import { google, docs_v1 } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAuthService } from '../google-auth/google-auth.service';

// ─── Types matching the frontend proposal.schema.ts ─────────────────────────

interface ScopeItem      { title: string; description?: string }
interface Deliverable    { item: string;  format?: string }
interface PaymentMilestone { milestone: string; amount: number; dueOn?: string }
interface TimelineMilestone { title: string; duration?: string; description?: string }
interface LineItem        { description: string; qty: number; rate: number; gstRate?: number }
interface FaqItem         { question: string; answer: string }
interface CaseStudy       { title: string; description: string; result?: string }

interface ProposalContent {
  intro?:          string
  whyUs?:          string
  nextSteps?:      string
  scopeItems?:     ScopeItem[]
  deliverables?:   Deliverable[]
  exclusions?:     string[]
  lineItems?:      LineItem[]
  pricingNotes?:   string
  gstType?:        string
  paymentSchedule?: PaymentMilestone[]
  milestones?:     TimelineMilestone[]
  terms?:          string
  faq?:            FaqItem[]
  caseStudies?:    CaseStudy[]
}

// ─── Helper: format INR ───────────────────────────────────────────────────────

function inr(n: number) {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

@Injectable()
export class GoogleDocsService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // ─── Drive file listing ──────────────────────────────────────────────────────

  async listDriveFiles(userId: string, query?: string) {
    const auth  = await this.googleAuth.getAuthorizedClient(userId);
    const drive = google.drive({ version: 'v3', auth });

    let q = "mimeType='application/vnd.google-apps.document' and trashed=false";
    if (query?.trim()) {
      q += ` and name contains '${query.trim().replace(/'/g, "\\'")}'`;
    }

    const { data } = await drive.files.list({
      q,
      fields:   'files(id,name,modifiedTime)',
      orderBy:  'modifiedTime desc',
      pageSize: 30,
    });

    return (data.files ?? []).map((f) => ({
      id:           f.id!,
      name:         f.name!,
      modifiedTime: f.modifiedTime ?? null,
    }));
  }

  // ─── Fetch doc as plain text ─────────────────────────────────────────────────

  async fetchDocAsText(userId: string, docId: string): Promise<string> {
    const auth    = await this.googleAuth.getAuthorizedClient(userId);
    const docsApi = google.docs({ version: 'v1', auth });

    const { data } = await docsApi.documents.get({ documentId: docId });
    return this.extractText(data);
  }

  private extractText(doc: docs_v1.Schema$Document): string {
    const lines: string[] = [];
    for (const el of doc.body?.content ?? []) {
      if (el.paragraph) {
        const text = (el.paragraph.elements ?? []).map((e) => e.textRun?.content ?? '').join('');
        const trimmed = text.trimEnd();
        if (trimmed) lines.push(trimmed);
      } else if (el.table) {
        for (const row of el.table.tableRows ?? []) {
          const cells = (row.tableCells ?? []).map((cell) =>
            (cell.content ?? [])
              .flatMap((c) => (c.paragraph?.elements ?? []).map((e) => e.textRun?.content ?? ''))
              .join('')
              .trim(),
          );
          lines.push(cells.join('\t'));
        }
      }
    }
    return lines.join('\n');
  }

  // ─── Export proposal ─────────────────────────────────────────────────────────

  async exportProposal(userId: string, proposalId: string): Promise<{ docUrl: string; docId: string }> {
    const proposal = await this.prisma.proposal.findFirst({
      where:   { id: proposalId, userId },
      include: { client: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const auth    = await this.googleAuth.getAuthorizedClient(userId);
    const docsApi = google.docs({ version: 'v1', auth });

    const title = proposal.title ?? 'Proposal';
    const { data: created } = await docsApi.documents.create({ requestBody: { title } });
    const docId = created.documentId!;

    const requests = this.buildProposalRequests(proposal);
    if (requests.length > 0) {
      await docsApi.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
    }

    return { docId, docUrl: `https://docs.google.com/document/d/${docId}/edit` };
  }

  // ─── Export contract ─────────────────────────────────────────────────────────

  async exportContract(userId: string, contractId: string): Promise<{ docUrl: string; docId: string }> {
    const contract = await this.prisma.contract.findFirst({
      where:   { id: contractId, userId },
      include: { client: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    const auth    = await this.googleAuth.getAuthorizedClient(userId);
    const docsApi = google.docs({ version: 'v1', auth });

    const title = contract.title ?? 'Contract';
    const { data: created } = await docsApi.documents.create({ requestBody: { title } });
    const docId = created.documentId!;

    const requests = this.buildContractRequests(contract);
    if (requests.length > 0) {
      await docsApi.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
    }

    return { docId, docUrl: `https://docs.google.com/document/d/${docId}/edit` };
  }

  // ─── Proposal builder ────────────────────────────────────────────────────────

  private buildProposalRequests(proposal: any): docs_v1.Schema$Request[] {
    const c = (proposal.content ?? {}) as ProposalContent;
    const segments: Segment[] = [];

    // Title + meta
    segments.push({ text: proposal.title ?? 'Proposal', style: 'TITLE' });
    if (proposal.client?.name) {
      segments.push({ text: `Prepared for: ${proposal.client.name}`, style: 'SUBTITLE' });
    }
    segments.push({ text: '' });

    // Cover / intro
    if (c.intro?.trim()) {
      segments.push({ text: 'Introduction', style: 'HEADING_1' });
      segments.push({ text: c.intro.trim() });
      segments.push({ text: '' });
    }
    if (c.whyUs?.trim()) {
      segments.push({ text: 'Why Us', style: 'HEADING_1' });
      segments.push({ text: c.whyUs.trim() });
      segments.push({ text: '' });
    }

    // Scope of work
    if (c.scopeItems?.length) {
      segments.push({ text: 'Scope of Work', style: 'HEADING_1' });
      for (const item of c.scopeItems) {
        segments.push({ text: `• ${item.title}`, bold: true });
        if (item.description?.trim()) {
          segments.push({ text: `  ${item.description.trim()}` });
        }
      }
      segments.push({ text: '' });
    }

    // Deliverables
    if (c.deliverables?.length) {
      segments.push({ text: 'Deliverables', style: 'HEADING_1' });
      for (const d of c.deliverables) {
        const line = d.format ? `• ${d.item}  (${d.format})` : `• ${d.item}`;
        segments.push({ text: line });
      }
      segments.push({ text: '' });
    }

    // Exclusions
    if (c.exclusions?.length) {
      segments.push({ text: 'Exclusions', style: 'HEADING_1' });
      for (const ex of c.exclusions) {
        segments.push({ text: `• ${ex}` });
      }
      segments.push({ text: '' });
    }

    // Pricing
    if (c.lineItems?.length) {
      segments.push({ text: 'Pricing', style: 'HEADING_1' });
      let subtotal = 0;
      for (const li of c.lineItems) {
        const amount = Number(li.qty) * Number(li.rate);
        subtotal += amount;
        segments.push({
          text: `${li.description}   ×${li.qty}   @${inr(li.rate)}   =   ${inr(amount)}`,
        });
      }
      segments.push({ text: `Total: ${inr(subtotal)}`, bold: true });
      if (c.pricingNotes?.trim()) {
        segments.push({ text: c.pricingNotes.trim(), italic: true });
      }
      segments.push({ text: '' });
    }

    // Payment schedule
    if (c.paymentSchedule?.length) {
      segments.push({ text: 'Payment Schedule', style: 'HEADING_1' });
      for (const p of c.paymentSchedule) {
        const due = p.dueOn ? `  (due: ${p.dueOn})` : '';
        segments.push({ text: `• ${p.milestone}   —   ${inr(p.amount)}${due}` });
      }
      segments.push({ text: '' });
    }

    // Timeline
    if (c.milestones?.length) {
      segments.push({ text: 'Timeline', style: 'HEADING_1' });
      c.milestones.forEach((m, i) => {
        const dur = m.duration ? `  [${m.duration}]` : '';
        segments.push({ text: `${i + 1}. ${m.title}${dur}`, bold: true });
        if (m.description?.trim()) {
          segments.push({ text: `   ${m.description.trim()}` });
        }
      });
      segments.push({ text: '' });
    }

    // Case studies
    if (c.caseStudies?.length) {
      segments.push({ text: 'Our Work', style: 'HEADING_1' });
      for (const cs of c.caseStudies) {
        segments.push({ text: cs.title, bold: true });
        segments.push({ text: cs.description });
        if (cs.result?.trim()) segments.push({ text: `Result: ${cs.result.trim()}`, italic: true });
        segments.push({ text: '' });
      }
    }

    // FAQ
    if (c.faq?.length) {
      segments.push({ text: 'Frequently Asked Questions', style: 'HEADING_1' });
      for (const f of c.faq) {
        segments.push({ text: `Q: ${f.question}`, bold: true });
        segments.push({ text: `A: ${f.answer}` });
        segments.push({ text: '' });
      }
    }

    // Terms
    if (c.terms?.trim()) {
      segments.push({ text: 'Terms & Conditions', style: 'HEADING_1' });
      // Split numbered lines for readability
      const termLines = c.terms.split('\n').filter((l) => l.trim());
      for (const line of termLines) {
        segments.push({ text: line.trim() });
      }
      segments.push({ text: '' });
    }

    // Next steps
    if (c.nextSteps?.trim()) {
      segments.push({ text: 'Next Steps', style: 'HEADING_1' });
      segments.push({ text: c.nextSteps.trim() });
    }

    return this.segmentsToRequests(segments);
  }

  // ─── Contract builder ────────────────────────────────────────────────────────

  private buildContractRequests(contract: any): docs_v1.Schema$Request[] {
    const c = (contract.content ?? {}) as Record<string, any>;
    const segments: Segment[] = [];

    segments.push({ text: contract.title ?? 'Contract', style: 'TITLE' });
    if (contract.client?.name) {
      segments.push({ text: `Client: ${contract.client.name}`, style: 'SUBTITLE' });
    }
    segments.push({ text: '' });

    if (c.startDate || c.endDate) {
      segments.push({ text: 'Project Duration', style: 'HEADING_1' });
      if (c.startDate) segments.push({ text: `Start: ${c.startDate}` });
      if (c.endDate)   segments.push({ text: `End:   ${c.endDate}` });
      segments.push({ text: '' });
    }

    if (Array.isArray(c.clauses) && c.clauses.length > 0) {
      segments.push({ text: 'Terms & Clauses', style: 'HEADING_1' });
      c.clauses.forEach((clause: any, i: number) => {
        if (clause.title) segments.push({ text: `${i + 1}. ${clause.title}`, bold: true });
        if (clause.body)  segments.push({ text: String(clause.body) });
        segments.push({ text: '' });
      });
    }

    if (Array.isArray(c.paymentSchedule) && c.paymentSchedule.length > 0) {
      segments.push({ text: 'Payment Schedule', style: 'HEADING_1' });
      for (const p of c.paymentSchedule as PaymentMilestone[]) {
        const due = p.dueOn ? `  (due: ${p.dueOn})` : '';
        segments.push({ text: `• ${p.milestone}   —   ${inr(p.amount)}${due}` });
      }
      segments.push({ text: '' });
    }

    if (c.governingLaw) {
      segments.push({ text: 'Governing Law', style: 'HEADING_1' });
      segments.push({ text: String(c.governingLaw) });
    }

    return this.segmentsToRequests(segments);
  }

  // ─── Segments → batchUpdate requests ────────────────────────────────────────

  private segmentsToRequests(segments: Segment[]): docs_v1.Schema$Request[] {
    const requests: docs_v1.Schema$Request[] = [];

    // Build full text and insert at position 1
    const fullText = segments.map((s) => s.text).join('\n') + '\n';
    requests.push({ insertText: { location: { index: 1 }, text: fullText } });

    // Walk through and apply styles
    let offset = 1;
    for (const seg of segments) {
      const len = seg.text.length;

      if (seg.style) {
        requests.push({
          updateParagraphStyle: {
            range:          { startIndex: offset, endIndex: offset + len },
            paragraphStyle: { namedStyleType: seg.style },
            fields:         'namedStyleType',
          },
        });
      }

      if ((seg.bold || seg.italic) && len > 0) {
        requests.push({
          updateTextStyle: {
            range:     { startIndex: offset, endIndex: offset + len },
            textStyle: { bold: seg.bold ?? false, italic: seg.italic ?? false },
            fields:    [seg.bold ? 'bold' : '', seg.italic ? 'italic' : ''].filter(Boolean).join(','),
          },
        });
      }

      // Add paragraph spacing after HEADING_1 and TITLE
      if (seg.style === 'HEADING_1' || seg.style === 'TITLE') {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: offset, endIndex: offset + len },
            paragraphStyle: {
              spaceAbove: { magnitude: seg.style === 'TITLE' ? 0  : 12, unit: 'PT' },
              spaceBelow: { magnitude: seg.style === 'TITLE' ? 6  : 4,  unit: 'PT' },
            },
            fields: 'spaceAbove,spaceBelow',
          },
        });
      }

      offset += len + 1; // +1 for the newline
    }

    return requests;
  }
}

// ─── Internal type ───────────────────────────────────────────────────────────

interface Segment {
  text:   string
  style?: 'TITLE' | 'SUBTITLE' | 'HEADING_1' | 'HEADING_2'
  bold?:  boolean
  italic?: boolean
}
