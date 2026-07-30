/**
 * Listens to domain events from proposals, contracts, invoices, and now
 * contracts/projects going inactive, and advances (or regresses) the
 * linked Contact and Project stages accordingly.
 *
 * Contact stage advance map:
 *   proposal.sent     → PROPOSAL_SENT  (from ENQUIRY only)
 *   proposal.accepted → NEGOTIATING    (from any pre-NEGOTIATING stage)
 *   proposal.declined → LOST           (only if no open proposals remain)
 *   contract.signed   → CLIENT         (from any pre-CLIENT stage)
 *   invoice.paid      → CLIENT         (first payment; from any pre-CLIENT stage)
 *
 * Contact stage regress map:
 *   contract.voided   → LOST           (from CLIENT or later)
 *   project.cancelled → LOST           (from CLIENT or later; only when the
 *                                        Contact has 1+ Project and none of
 *                                        them remain outside CANCELLED)
 *
 * Project stage advance map:
 *   proposal.sent     → PROPOSAL_SENT  (from SCOPING only)
 *   contract.signed   → ACTIVE         (from SCOPING or PROPOSAL_SENT)
 *   invoice.paid      → ACTIVE         (from SCOPING or PROPOSAL_SENT)
 */
import { Injectable, Logger } from '@nestjs/common';
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

// KTD1: index-comparison helper for regression checks — "at or past a
// stage," which the forward-only contactIsEarlierThan can't express.
function contactIsAtLeast(current: ContactStage, target: ContactStage): boolean {
  return CONTACT_STAGE_ORDER.indexOf(current) >= CONTACT_STAGE_ORDER.indexOf(target)
}

function projectIsEarlierThan(current: ProjectStage, target: ProjectStage): boolean {
  const idx = PROJECT_STAGE_ORDER.indexOf(current)
  return idx !== -1 && idx < PROJECT_STAGE_ORDER.indexOf(target)
}

@Injectable()
export class StageAdvanceService {
  private readonly logger = new Logger(StageAdvanceService.name)

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

  // ── contract.voided → Contact: LOST (from CLIENT or later) ─────────────────

  @OnEvent('contract.voided')
  async onContractVoided(ev: { entityId: string; workspaceId: string }) {
    const contract = await this.prisma.contract.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true },
    })
    if (!contract?.contactId) return

    const contact = await this.prisma.contact.findUnique({
      where:  { id: contract.contactId },
      select: { stage: true, archivedAt: true },
    })
    if (!contact || contact.archivedAt) return

    // R6: a voided contract signals the relationship has fallen through —
    // regress to LOST if the Contact had already reached CLIENT or later.
    if (!contactIsAtLeast(contact.stage, 'CLIENT')) return

    await this.prisma.contact.update({
      where: { id: contract.contactId },
      data:  { stage: 'LOST', lastActivityAt: new Date() },
    })
    this.logger.log(`Contact ${contract.contactId} regressed to LOST (trigger: contract.voided, contract ${ev.entityId})`)
  }

  // ── project.cancelled → Contact: LOST (from CLIENT or later, only when ────
  // ── every Project the Contact has is cancelled) ─────────────────────────────

  @OnEvent('project.cancelled')
  async onProjectCancelled(ev: { entityId: string; workspaceId: string }) {
    const project = await this.prisma.project.findUnique({
      where:  { id: ev.entityId },
      select: { contactId: true },
    })
    if (!project?.contactId) return

    const contact = await this.prisma.contact.findUnique({
      where:  { id: project.contactId },
      select: { stage: true, archivedAt: true },
    })
    if (!contact || contact.archivedAt) return
    if (!contactIsAtLeast(contact.stage, 'CLIENT')) return

    // R5/KTD3: a Project counts as cancelled if either status or projectStage
    // is CANCELLED — the two fields aren't kept in sync with each other, so
    // "still active" requires neither field to be CANCELLED.
    const [activeProjectCount, totalProjectCount] = await Promise.all([
      this.prisma.project.count({
        where: {
          contactId: project.contactId,
          status:    { not: 'CANCELLED' },
          OR: [
            { projectStage: null },
            { projectStage: { not: 'CANCELLED' } },
          ],
        },
      }),
      this.prisma.project.count({ where: { contactId: project.contactId } }),
    ])

    // KTD4: a Contact with zero Projects never regresses via this path —
    // treat the vacuous case as "nothing to evaluate," not "everything failed."
    if (totalProjectCount < 1) return
    if (activeProjectCount > 0) return

    // R6: all Projects are cancelled and the Contact had reached CLIENT or
    // later — regress to LOST.
    await this.prisma.contact.update({
      where: { id: project.contactId },
      data:  { stage: 'LOST', lastActivityAt: new Date() },
    })
    this.logger.log(`Contact ${project.contactId} regressed to LOST (trigger: project.cancelled, all projects cancelled, project ${ev.entityId})`)
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
