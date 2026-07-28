/**
 * Phase B: Backfill contacts table and all contactId FK columns.
 *
 * Run AFTER Phase A migrations (001 + 002) have been applied to the database.
 * Safe to re-run — workspaces that already have contacts are skipped.
 *
 *   npx tsx prisma/scripts/migrate-contacts.ts
 */
import 'dotenv/config'
import { PrismaClient, LeadStage, ContactStage, ProjectStage, ProjectStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['warn', 'error'] })

// ── Stage mappings ─────────────────────────────────────────────────────────────

function mapLeadStage(s: LeadStage): ContactStage {
  switch (s) {
    case 'ENQUIRY':       return 'ENQUIRY'
    case 'PROPOSAL_SENT': return 'PROPOSAL_SENT'
    case 'NEGOTIATING':   return 'NEGOTIATING'
    case 'WON':           return 'CLIENT'
    case 'LOST':          return 'LOST'
  }
}

function mapProjectStatus(s: ProjectStatus): ProjectStage {
  switch (s) {
    case 'ACTIVE':    return 'ACTIVE'
    case 'COMPLETED': return 'COMPLETED'
    case 'ON_HOLD':   return 'ON_HOLD'
    case 'CANCELLED': return 'CANCELLED'
  }
}

const STAGE_ORDER: ContactStage[] = [
  'ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING', 'CLIENT', 'PAST_CLIENT', 'LOST',
]
function stagePriority(s: ContactStage) { return STAGE_ORDER.indexOf(s) }

// ── Per-workspace migration (returns lead/client → contact maps for Step 11) ──

async function migrateWorkspace(
  workspaceId: string,
): Promise<{ leadToContact: Map<string, string>; clientToContact: Map<string, string> }> {
  const empty = { leadToContact: new Map<string, string>(), clientToContact: new Map<string, string>() }

  const existing = await prisma.contact.count({ where: { workspaceId } })
  if (existing > 0) {
    console.log(`  ${workspaceId}: already has ${existing} contacts — skipping`)
    return empty
  }

  const leadToContact   = new Map<string, string>()
  const clientToContact = new Map<string, string>()

  await prisma.$transaction(
    async (tx) => {
      // ── Steps 1 + 3: All clients (with and without leads) ──────────────────
      const clients = await tx.client.findMany({
        where:   { workspaceId },
        include: { leads: true },
      })

      for (const client of clients) {
        const leads = client.leads

        let contactStage: ContactStage = 'CLIENT'
        if (leads.length > 0) {
          const stages = leads.map(l => mapLeadStage(l.stage))
          contactStage = stages.reduce((best, s) =>
            stagePriority(s) > stagePriority(best) ? s : best,
            stages[0],
          )
        }

        const primary = leads
          .filter(l => !l.isDeleted)
          .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())[0]

        const contact = await tx.contact.create({
          data: {
            workspaceId,
            name:            client.name,
            email:           client.email,
            phone:           client.phone,
            company:         client.company,
            gstNumber:       client.gstNumber,
            state:           client.state,
            portalToken:     client.portalToken,
            clickupMemberId: client.clickupMemberId,
            source:          primary?.source     ?? null,
            service:         primary?.service    ?? null,
            dealValue:       primary?.budget      ?? null,
            followUpAt:      primary?.followUpAt  ?? null,
            lastActivityAt:  primary?.lastActivityAt ?? client.createdAt,
            stage:           contactStage,
            archivedAt:      client.archivedAt,
            createdAt:       client.createdAt,
            updatedAt:       client.updatedAt,
          },
        })

        clientToContact.set(client.id, contact.id)
        for (const lead of leads) {
          leadToContact.set(lead.id, contact.id)
        }
      }

      // ── Step 2: Standalone leads (no clientId) ──────────────────────────────
      const standaloneLeads = await tx.lead.findMany({
        where: { workspaceId, clientId: null },
      })

      for (const lead of standaloneLeads) {
        const contact = await tx.contact.create({
          data: {
            workspaceId,
            name:           lead.name,
            email:          lead.email,
            phone:          lead.phone,
            company:        lead.company,
            source:         lead.source,
            service:        lead.service,
            dealValue:      lead.budget,
            followUpAt:     lead.followUpAt,
            lastActivityAt: lead.lastActivityAt,
            stage:          mapLeadStage(lead.stage),
            archivedAt:     lead.archivedAt ?? (lead.isDeleted ? lead.updatedAt : null),
            createdAt:      lead.createdAt,
            updatedAt:      lead.updatedAt,
          },
        })
        leadToContact.set(lead.id, contact.id)
      }

      console.log(
        `  ${workspaceId}: created ${clientToContact.size} contacts from clients,` +
        ` ${standaloneLeads.length} from standalone leads`,
      )

      // ── Step 4: Project.contactId ───────────────────────────────────────────
      const projects = await tx.project.findMany({ where: { workspaceId } })
      let nProjects = 0
      for (const p of projects) {
        const contactId = p.clientId ? clientToContact.get(p.clientId) : undefined
        if (contactId) {
          await tx.project.update({ where: { id: p.id }, data: { contactId } })
          nProjects++
        }
      }

      // ── Step 5: (no auto-create default projects — app handles first project)

      // ── Step 6: Thread.contactId ────────────────────────────────────────────
      const threads = await tx.thread.findMany({ where: { workspaceId } })
      let nThreads = 0
      for (const t of threads) {
        const contactId = t.clientId ? clientToContact.get(t.clientId) : undefined
        if (contactId) {
          await tx.thread.update({ where: { id: t.id }, data: { contactId } })
          nThreads++
        }
      }

      // ── Step 7: Meeting.contactId ───────────────────────────────────────────
      const meetings = await tx.meeting.findMany({ where: { workspaceId } })
      let nMeetings = 0
      for (const m of meetings) {
        const contactId = (m.clientId ? clientToContact.get(m.clientId) : undefined)
          ?? (m.leadId   ? leadToContact.get(m.leadId)   : undefined)
        if (contactId) {
          await tx.meeting.update({ where: { id: m.id }, data: { contactId } })
          nMeetings++
        }
      }

      // ── Step 8: Documents (Proposal, Contract, Invoice, TimeEntry, Expense, Attachment)
      const proposals = await tx.proposal.findMany({ where: { workspaceId } })
      let nProposals = 0
      for (const p of proposals) {
        const contactId = (p.clientId ? clientToContact.get(p.clientId) : undefined)
          ?? (p.leadId ? leadToContact.get(p.leadId) : undefined)
        if (contactId) {
          await tx.proposal.update({ where: { id: p.id }, data: { contactId } })
          nProposals++
        }
      }

      const contracts = await tx.contract.findMany({ where: { workspaceId } })
      let nContracts = 0
      for (const c of contracts) {
        const contactId = c.clientId ? clientToContact.get(c.clientId) : undefined
        if (contactId) {
          await tx.contract.update({ where: { id: c.id }, data: { contactId } })
          nContracts++
        }
      }

      const invoices = await tx.invoice.findMany({ where: { workspaceId } })
      let nInvoices = 0
      for (const inv of invoices) {
        const contactId = inv.clientId ? clientToContact.get(inv.clientId) : undefined
        if (contactId) {
          await tx.invoice.update({ where: { id: inv.id }, data: { contactId } })
          nInvoices++
        }
      }

      const timeEntries = await tx.timeEntry.findMany({ where: { workspaceId } })
      let nTimeEntries = 0
      for (const te of timeEntries) {
        const contactId = te.clientId ? clientToContact.get(te.clientId) : undefined
        if (contactId) {
          await tx.timeEntry.update({ where: { id: te.id }, data: { contactId } })
          nTimeEntries++
        }
      }

      const expenses = await tx.expense.findMany({ where: { workspaceId } })
      let nExpenses = 0
      for (const e of expenses) {
        const contactId = e.clientId ? clientToContact.get(e.clientId) : undefined
        if (contactId) {
          await tx.expense.update({ where: { id: e.id }, data: { contactId } })
          nExpenses++
        }
      }

      const attachments = await tx.attachment.findMany({ where: { workspaceId } })
      let nAttachments = 0
      for (const a of attachments) {
        const contactId = a.clientId ? clientToContact.get(a.clientId) : undefined
        if (contactId) {
          await tx.attachment.update({ where: { id: a.id }, data: { contactId } })
          nAttachments++
        }
      }

      // ── Step 9: Project.projectStage from status ────────────────────────────
      for (const p of projects) {
        await tx.project.update({
          where: { id: p.id },
          data:  { projectStage: mapProjectStatus(p.status) },
        })
      }

      // ── Step 10: ClientNote.contactId ───────────────────────────────────────
      const notes = await tx.clientNote.findMany({ where: { workspaceId } })
      let nNotes = 0
      for (const n of notes) {
        const contactId = n.clientId ? clientToContact.get(n.clientId) : undefined
        if (contactId) {
          await tx.clientNote.update({ where: { id: n.id }, data: { contactId } })
          nNotes++
        }
      }

      console.log(
        `  ${workspaceId}: linked — projects:${nProjects} threads:${nThreads} meetings:${nMeetings}` +
        ` proposals:${nProposals} contracts:${nContracts} invoices:${nInvoices}` +
        ` timeEntries:${nTimeEntries} expenses:${nExpenses} attachments:${nAttachments} notes:${nNotes}`,
      )
    },
    { timeout: 120_000 },
  )

  return { leadToContact, clientToContact }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  console.log(`Migrating ${workspaces.length} workspace(s)…\n`)

  // Accumulate global lead→contact map for Step 11
  const globalLeadToContact = new Map<string, string>()

  for (const ws of workspaces) {
    const { leadToContact } = await migrateWorkspace(ws.id)
    for (const [k, v] of leadToContact) globalLeadToContact.set(k, v)
  }

  // ── Step 11: DiscoveredLead.importedAsContactId ──────────────────────────────
  // DiscoveredLeads belong to campaigns/users — not workspace-scoped — so handled globally.
  console.log('\nStep 11: backfilling discoveredLead.importedAsContactId…')
  const discovered = await prisma.discoveredLead.findMany({
    where:  { importedAsLeadId: { not: null } },
    select: { id: true, importedAsLeadId: true },
  })
  let nDiscovered = 0
  for (const dl of discovered) {
    if (!dl.importedAsLeadId) continue
    const contactId = globalLeadToContact.get(dl.importedAsLeadId)
    if (contactId) {
      await prisma.discoveredLead.update({
        where: { id: dl.id },
        data:  { importedAsContactId: contactId },
      })
      nDiscovered++
    }
  }
  console.log(`  importedAsContactId set on ${nDiscovered}/${discovered.length} discovered leads`)

  // ── Step 12: AutomationRule trigger key renames ──────────────────────────────
  console.log('\nStep 12: renaming AutomationRule trigger keys…')
  const KEY_MAP: Record<string, { key: string; triggerEvent: string }> = {
    'lead.cold.d7': { key: 'contact.cold.d7', triggerEvent: 'schedule.contact.cold' },
    'lead.created': { key: 'contact.created', triggerEvent: 'event.contact.created' },
  }

  for (const [oldKey, newData] of Object.entries(KEY_MAP)) {
    const rules = await prisma.automationRule.findMany({ where: { key: oldKey } })
    for (const rule of rules) {
      const clash = await prisma.automationRule.findUnique({
        where: { workspaceId_key: { workspaceId: rule.workspaceId, key: newData.key } },
      })
      if (clash) {
        // New key already seeded by a fresh workspace setup — remove the old one
        await prisma.automationRule.delete({ where: { id: rule.id } })
        console.log(`  ${rule.workspaceId}: ${newData.key} already exists — removed duplicate ${oldKey}`)
      } else {
        await prisma.automationRule.update({
          where: { id: rule.id },
          data:  { key: newData.key, triggerEvent: newData.triggerEvent },
        })
        console.log(`  ${rule.workspaceId}: renamed ${oldKey} → ${newData.key}`)
      }
    }
  }

  console.log('\nPhase B migration complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
