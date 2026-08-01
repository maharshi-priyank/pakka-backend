import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

interface ContractContent {
  intro?: string;
  projectDescription?: string;
  totalAmount?: number;
  gstAmount?: number;
  gstType?: string;
  scopeItems?: Array<{ title: string; description?: string }>;
  deliverables?: Array<{ item: string; format?: string }>;
  exclusions?: string[];
  paymentSchedule?: Array<{ milestone: string; amount: number; dueOn?: string }>;
  clauses?: Array<{ title: string; body: string }>;
  signerName?: string;
  signerEmail?: string;
}

interface GeneratePdfParams {
  title:        string;
  businessName: string;
  clientName:   string;
  content:      ContractContent;
  createdAt:    Date;
}

@Injectable()
export class OpenSignPdfGenerator {
  async generate(params: GeneratePdfParams): Promise<Buffer> {
    const { title, businessName, clientName, content, createdAt } = params;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#666666')
        .text(`Date: ${createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Between: ${businessName} and ${clientName}`, { align: 'center' });
      doc.moveDown(1);
      doc.fillColor('#000000');
      this.drawDivider(doc);

      if (content.intro) {
        doc.fontSize(11).font('Helvetica').text(content.intro);
        doc.moveDown(0.8);
      }

      if (content.projectDescription) {
        this.sectionHeading(doc, 'Project Description');
        doc.fontSize(10).font('Helvetica').text(content.projectDescription);
        doc.moveDown(0.8);
      }

      if (content.scopeItems?.length) {
        this.sectionHeading(doc, 'Scope of Work');
        for (const item of content.scopeItems) {
          doc.fontSize(10).font('Helvetica-Bold').text(`• ${item.title}`);
          if (item.description) doc.font('Helvetica').text(`  ${item.description}`);
          doc.moveDown(0.3);
        }
        doc.moveDown(0.5);
      }

      if (content.deliverables?.length) {
        this.sectionHeading(doc, 'Deliverables');
        for (const d of content.deliverables) {
          const fmt = d.format ? ` (${d.format})` : '';
          doc.fontSize(10).font('Helvetica').text(`• ${d.item}${fmt}`);
        }
        doc.moveDown(0.8);
      }

      if (content.exclusions?.length) {
        this.sectionHeading(doc, 'Exclusions');
        for (const ex of content.exclusions) {
          doc.fontSize(10).font('Helvetica').text(`• ${ex}`);
        }
        doc.moveDown(0.8);
      }

      if (content.paymentSchedule?.length) {
        this.sectionHeading(doc, 'Payment Schedule');
        const total = content.totalAmount ?? 0;
        if (total > 0) {
          doc.fontSize(10).font('Helvetica-Bold')
            .text(`Total Amount: ₹${total.toLocaleString('en-IN')}`);
          if (content.gstAmount && content.gstAmount > 0) {
            doc.font('Helvetica')
              .text(`GST (${content.gstType ?? 'IGST'}): ₹${content.gstAmount.toLocaleString('en-IN')}`);
          }
          doc.moveDown(0.4);
        }
        for (const p of content.paymentSchedule) {
          const due = p.dueOn ? ` — Due: ${p.dueOn}` : '';
          doc.fontSize(10).font('Helvetica')
            .text(`• ${p.milestone}: ₹${p.amount.toLocaleString('en-IN')}${due}`);
        }
        doc.moveDown(0.8);
      }

      if (content.clauses?.length) {
        this.sectionHeading(doc, 'Terms & Conditions');
        for (let i = 0; i < content.clauses.length; i++) {
          const clause = content.clauses[i];
          doc.fontSize(10).font('Helvetica-Bold').text(`${i + 1}. ${clause.title}`);
          doc.font('Helvetica').text(clause.body);
          doc.moveDown(0.5);
        }
      }

      // Signature page — OpenSign places the signature widget at page:-1, y:620
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('Signature', { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(11).font('Helvetica')
        .text(`I, ${content.signerName ?? clientName}, agree to the terms outlined in this contract.`);
      doc.moveDown(10); // reserve space at y≈620 for OpenSign's signature widget

      this.drawDivider(doc);
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
        .text(content.signerName ?? clientName);
      doc.text(`Date: _______________`);

      doc.end();
    });
  }

  private sectionHeading(doc: any, text: string) {
    doc.fontSize(12).font('Helvetica-Bold').text(text);
    doc.moveDown(0.3);
  }

  private drawDivider(doc: any) {
    const y = doc.y;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
  }
}
