/**
 * Listens to domain events from proposals, contracts, and invoices and
 * advances the linked Contact and Project stages accordingly.
 *
 * Contact stage advance map:
 *   proposal.sent     → PROPOSAL_SENT  (from ENQUIRY only)
 *   proposal.accepted → NEGOTIATING    (from any pre-NEGOTIATING stage)
 *   proposal.declined → LOST           (only if no open proposals remain)
 *   contract.signed   → CLIENT         (from any pre-CLIENT stage)
 *   invoice.paid      → CLIENT         (first payment; from any pre-CLIENT stage)
 *
 * Project stage advance map:
 *   proposal.sent     → PROPOSAL_SENT  (from SCOPING only)
 *   contract.signed   → ACTIVE         (from SCOPING or PROPOSAL_SENT)
 *   invoice.paid      → ACTIVE         (from SCOPING or PROPOSAL_SENT)
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactStage, ProjectStage } from '@prisma/client';

const CONTACT_STAGE_ORDER: ContactStage[] = [
  'ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING', 'CLIENT', 'PAST_CLIENT', 'LOST',
]

const PROJECT_STAGE_ORDER: ProjectStage[] = [
  'SCOPING', 'PROPOSAL_SENT', 'ACTIVE', 'COMPLETED',
]

function contactIsEarlierThan(current: ContactStage, target: ContactStage): boolean {
  return CONTACT_STAGE_ORDER.indexOf(current) < CONTACT_STAGE_ORDER.indexOf(target)
}

function projectIsEarlierThan(current: ProjectStage, target: ProjectStage): boolean {
  const idx = PROJECT_STAGE_ORDER.indexOf(current)
  return idx !== -1 && idx < PROJECT_STAGE_ORDER.indexOf(target)
}

@Injectable()
export class StageAdvanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── proposal.sent → Contact: PROPOSAL_SENT, Project: PROPOSAL_SENT ─────────

  @OnEvent('proposal.sent')
  async onProposalSent(ev: { entityId: string; workspaceId: string }) {
    const proposal = await this.prisma.proposal.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true, projectId: true },
    })
    if (!proposal) return
    if (proposal.contactId) await this.advanceContactStage(proposal.contactId, 'PROPOSAL_SENT')
    if (proposal.projectId) await this.advanceProjectStage(proposal.projectId, 'PROPOSAL_SENT')
  }

  // ── proposal.accepted → Contact: NEGOTIATING ───────────────────────────────

  @OnEvent('proposal.accepted')
  async onProposalAccepted(ev: { entityId: string; workspaceId: string }) {
    const proposal = await this.prisma.proposal.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true },
    })
    if (!proposal?.contactId) return
    await this.advanceContactStage(proposal.contactId, 'NEGOTIATING')
  }

  // ── proposal.declined → Contact: LOST (only if no other open proposals) ────

  @OnEvent('proposal.declined')
  async onProposalDeclined(ev: { entityId: string; workspaceId: string }) {
    const proposal = await this.prisma.proposal.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true },
    })
    if (!proposal?.contactId) return

    const openProposals = await this.prisma.proposal.count({
      where: {
        contactId: proposal.contactId,
        status:    { in: ['DRAFT', 'SENT', 'OPENED'] },
        id:        { not: ev.entityId },
      },
    })
    if (openProposals > 0) return

    await this.advanceContactStage(proposal.contactId, 'LOST')
  }

  // ── contract.signed → Contact: CLIENT, Project: ACTIVE ─────────────────────

  @OnEvent('contract.signed')
  async onContractSigned(ev: { entityId: string; workspaceId: string }) {
    const contract = await this.prisma.contract.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true, projectId: true },
    })
    if (!contract) return
    if (contract.contactId) await this.advanceContactStage(contract.contactId, 'CLIENT')
    if (contract.projectId) await this.advanceProjectStage(contract.projectId, 'ACTIVE')
  }

  // ── invoice.paid → Contact: CLIENT (first payment), Project: ACTIVE ─────────

  @OnEvent('invoice.paid')
  async onInvoicePaid(ev: { entityId: string; workspaceId: string }) {
    const invoice = await this.prisma.invoice.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true, projectId: true },
    })
    if (!invoice) return
    if (invoice.contactId) await this.advanceContactStage(invoice.contactId, 'CLIENT')
    if (invoice.projectId) await this.advanceProjectStage(invoice.projectId, 'ACTIVE')
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async advanceContactStage(contactId: string, target: ContactStage) {
    const contact = await this.prisma.contact.findUnique({
      where:  { id: contactId },
      select: { stage: true, archivedAt: true },
    })
    if (!contact || contact.archivedAt) return
    if (!contactIsEarlierThan(contact.stage, target)) return

    await this.prisma.contact.update({
      where: { id: contactId },
      data:  { stage: target, lastActivityAt: new Date() },
    })
  }

  private async advanceProjectStage(projectId: string, target: ProjectStage) {
    const project = await this.prisma.project.findUnique({
      where:  { id: projectId },
      select: { projectStage: true },
    })
    if (!project?.projectStage) return
    if (!projectIsEarlierThan(project.projectStage, target)) return

    await this.prisma.project.update({
      where: { id: projectId },
      data:  { projectStage: target, updatedAt: new Date() },
    })
  }
}
