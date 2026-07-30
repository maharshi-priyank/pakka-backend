---
date: 2026-07-09
title: "feat: Unified Contact — Phase C Completion (Backend gaps + UX surfaces)"
type: feat
origin: docs/brainstorms/2026-07-07-unified-contact-entity-requirements.md
target-repos:
  - pakka-api   (backend units U1–U4)
  - pakka-app   (frontend units U5–U10)
---

# feat: Unified Contact — Phase C Completion

## Summary

Phase A (additive DDL) and Phase B (data backfill) are done. The Contact list page (U11) and the Contacts API are live. This plan closes the remaining Phase C work: three backend logic gaps, one new backend rule, and four frontend surfaces that make the unified model **understandable to users**.

The UX problem to solve: freelancers currently can't understand how the system works because no single view shows a contact alongside all their projects and documents. This plan delivers the Contact detail page — the "command center" that collapses the old Lead/Client split into one coherent view — plus a dedicated Pipeline view, an updated Clients view, and small fixes for inbox and contacts list.

---

## Problem Frame

Backend logic that is still wrong or missing:
- `invoice.paid` advances Contact to `PAST_CLIENT` (all invoices paid). Per R9, it should advance to `CLIENT` on the **first payment**.
- Contact creation auto-creates a Thread but not the required default SCOPING Project (R14).
- Deleting the last Project on a Contact is not blocked (R15).
- Project stage does not auto-advance (R19, R20). Only Contact stage auto-advances today.
- Creating a new Project on a `PAST_CLIENT` Contact does not advance the Contact to `CLIENT` (R22).

Frontend surfaces still missing or wrong:
- No Contact detail page — clicking a contact shows a stub popup.
- No Pipeline view — the only kanban is on `/contacts` and shows Contact cards (wrong unit).
- Clients view reads from the legacy `clients` table.
- Inbox shows no name for threads that migrated to `contactId` with no `clientId`.
- Contacts page has a kanban toggle that should be removed (Contact kanban is being replaced by the Pipeline page).

---

## Key Technical Decisions

**invoice.paid logic (U1):** Per R9, a single invoice payment should advance Contact to `CLIENT`. The current logic gates on all invoices being paid and advances to `PAST_CLIENT`. Fix: on `invoice.paid`, call `advanceStage(contactId, 'CLIENT')` — the existing `isEarlierThan` guard means already-CLIENT contacts are unaffected.

**Project stage auto-advance (U1):** `StageAdvanceService` must also advance the linked Project's stage, not only the Contact's stage. `proposal.sent → Project.stage = PROPOSAL_SENT` (if Project is in SCOPING). `contract.signed` or `invoice.paid → Project.stage = ACTIVE` (if Project is in SCOPING or PROPOSAL_SENT).

**Default Project naming (U2):** Named after `Contact.company` if set, else `Contact.name`. Created in the same `$transaction` as the Contact and Thread (one atomic operation).

**Pipeline value aggregation (R33):** Keep summing `Contact.dealValue` for contacts where stage is in `ENQUIRY`, `PROPOSAL_SENT`, `NEGOTIATING`. Project.budget is often null at SCOPING/PROPOSAL_SENT stage. `Contact.dealValue` is the freelancer-entered deal value and is the reliable field for this metric.

**Notes — keep two tables:** `ProjectNote` and `ClientNote` (migrated to `ContactNote`) remain separate. Contact detail renders both via two parallel queries. No schema merge in this sprint.

**Contact detail page layout — Option A (vertical scroll with sticky left sidebar):** Left column (fixed width) holds contact identity + pipeline fields — always visible as user scrolls. Right column (flex) stacks: Projects accordion → Thread → Meetings. No tabs. Everything visible without switching views.

**Contacts page — table + cards only:** Remove the kanban toggle. Add a cards (grid) view. Click either table row or card → navigate to `/contacts/:id`. Stage changes via drag-and-drop are removed from this page; they happen via the stage badge on the Contact detail page.

**Pipeline view — new `/pipeline` route:** Shows Projects in `SCOPING` and `PROPOSAL_SENT` as kanban cards. Contact name is secondary. NEGOTIATING contacts appear in a collapsible right sidebar list. Drag cards between columns → `PATCH /projects/:id/stage`.

**Clients view — migrate in-place:** `/clients` route reads from Contact API with `stage=CLIENT,PAST_CLIENT`. Collapsible "Past clients" section at bottom. Click row → `/contacts/:id`. The legacy `clients` API call is replaced; no URL change.

---

## High-Level Technical Design

### Contact Detail Page layout

```
┌──────────────────── sticky header ─────────────────────────────┐
│ ← Back   Rahul Sharma · Sharma Digital   [PROPOSAL_SENT ▾]     │
│          rahul@sharma.com  ·  +91 98765 43210      [Edit] [⋮]  │
└────────────────────────────────────────────────────────────────┘

┌─── left sidebar (280px sticky) ───┐  ┌─── right main (flex) ──────────────┐
│  Deal value    ₹2,50,000          │  │  PROJECTS                [+ New]   │
│  Service       Web Design         │  │                                     │
│  Source        Referral           │  │  ▼ Sharma Website Redesign [ACTIVE] │
│  Follow-up     Jul 15 ⚠           │  │    ₹2,50,000 · Jun–Aug              │
│  GST           29AAACH7409R1Z5    │  │    Proposals (1) · Contracts (1)    │
│  State         Karnataka          │  │    Invoices (2) · Tasks (3)         │
│  Notes         Met at conf...     │  │    ─── expanded inline list ───     │
│                                   │  │                                     │
│  Portal link   [Copy] [Open]      │  │  ▶ Brand Identity Design [SCOPING]  │
│                                   │  │    ₹80,000 · no dates yet            │
│                                   │  ├─────────────────────────────────────┤
│                                   │  │  THREAD  (chat UI, WhatsApp-style)  │
│                                   │  │  — full conversation history —      │
│                                   │  ├─────────────────────────────────────┤
│                                   │  │  MEETINGS                           │
│                                   │  │  · Strategy Call  Jul 10 3pm  Zoom  │
└───────────────────────────────────┘  └─────────────────────────────────────┘
```

### Pipeline view layout

```
┌─── /pipeline ─────────────────────────────────────────────────────────────┐
│  Pipeline  ₹8,50,000 in-flight     [Filters]   [NEGOTIATING (3) ▸]        │
│                                                                            │
│  SCOPING (4)              PROPOSAL SENT (2)      ╔═ Negotiating ════════╗ │
│  ┌──────────────────┐    ┌──────────────────┐    ║ • Vikram – ₹3,00,000 ║ │
│  │ Brand Identity   │    │ Website Redesign │    ║ • Priya – ₹1,50,000  ║ │
│  │ Rahul Sharma     │    │ Rahul Sharma     │    ║ • Arun  – ₹60,000    ║ │
│  │ ₹80,000          │    │ ₹2,50,000        │    ╚══════════════════════╝ │
│  │ 3 days in stage  │    │ 7 days in stage  │                             │
│  └──────────────────┘    └──────────────────┘                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Stage advance event chain

```
proposal.sent
  → Contact: ENQUIRY → PROPOSAL_SENT (if current is ENQUIRY)
  → Project:  SCOPING → PROPOSAL_SENT (if current is SCOPING)

contract.signed  OR  invoice.paid (first payment)
  → Contact: any pre-CLIENT → CLIENT
  → Project:  SCOPING/PROPOSAL_SENT → ACTIVE

new Project created on PAST_CLIENT Contact
  → Contact: PAST_CLIENT → CLIENT (automatic)
```

---

## Requirements Trace

| Req | Description | Units |
|-----|-------------|-------|
| R9  | invoice.paid → CLIENT on first payment | U1 |
| R14 | Auto-create default Project on Contact creation | U2 |
| R15 | Block deleting last Project on Contact | U3 |
| R19 | Project auto-advance SCOPING→PROPOSAL_SENT on proposal sent | U1 |
| R20 | Project auto-advance to ACTIVE on contract signed / invoice paid | U1 |
| R22 | PAST_CLIENT→CLIENT when new Project created | U4 |
| R24 | Thread available on Contact from creation | U2 (already creates Thread) |
| R27 | Pipeline view shows Project cards | U6 |
| R28 | Clients view: CLIENT + collapsible PAST_CLIENT | U7 |
| R29 | Contacts view: all contacts, filterable | U8 |
| R30 | Contact detail page | U5 |
| AE1 | Stage guard: CLIENT contact doesn't advance on proposal sent | U1 (isEarlierThan guard) |
| AE2 | Project + Contact advance together on contract sign | U1 |
| AE5 | PAST_CLIENT visible in Clients view under "Past" | U7 |
| AE6 | Last Project deletion blocked | U3 |
| AE7 | Pipeline shows Project cards | U6 |
| AE8 | New Project on PAST_CLIENT → Contact advances to CLIENT | U4 |

---

## Implementation Units

### U1. Fix StageAdvanceService — invoice.paid logic + Project stage advances

**Goal:** Correct two bugs and add the missing Project-stage advance side-effects to every event handler.

**Requirements:** R9, R19, R20, AE1, AE2

**Dependencies:** none

**Files:**
- Modify: `src/modules/contacts/stage-advance.service.ts`

**Approach:**

*Bug fix 1 — invoice.paid → CLIENT (not PAST_CLIENT):*
The `onInvoicePaid` handler must call `advanceStage(contactId, 'CLIENT')` unconditionally (subject to the `isEarlierThan` guard). Remove the "all invoices paid" check entirely — that check is what created the PAST_CLIENT logic which contradicts R9.

*Bug fix 2 — Add Project stage advances to every event handler:*

Each existing handler must also advance the linked Project's stage. Add a private `advanceProjectStage(projectId, target)` helper mirroring the existing `advanceStage` pattern.

| Event | Project advance | Guard |
|---|---|---|
| `proposal.sent` | SCOPING → PROPOSAL_SENT | only if project is in SCOPING |
| `contract.signed` | SCOPING/PROPOSAL_SENT → ACTIVE | only if project is earlier than ACTIVE |
| `invoice.paid` | SCOPING/PROPOSAL_SENT → ACTIVE | only if project is earlier than ACTIVE |

Each handler must look up `proposal.projectId` / `contract.projectId` / `invoice.projectId` to find which Project to advance. These FKs already exist on the models.

**Patterns to follow:** `advanceStage()` in the same file. `isEarlierThan()` utility already handles the guard.

**Test scenarios:**
- `invoice.paid` on a Contact in `PROPOSAL_SENT` → Contact advances to `CLIENT`. Project (PROPOSAL_SENT) advances to `ACTIVE`.
- `invoice.paid` on a Contact already in `CLIENT` → Contact stage unchanged. Project (PROPOSAL_SENT) advances to `ACTIVE`.
- `invoice.paid` on a Contact in `PAST_CLIENT` → no change (isEarlierThan guard on Contact; Project may still advance).
- `contract.signed` on a Contact in `NEGOTIATING` → Contact → `CLIENT`, Project → `ACTIVE`. (Covers AE2.)
- `proposal.sent` on a Contact in `CLIENT` → Contact unchanged (AE1 guard). Project in SCOPING → advances to PROPOSAL_SENT.
- `proposal.sent` on Project already in `PROPOSAL_SENT` → no change to Project stage.

**Verification:** All 6 test scenarios pass. No TypeScript errors (`npx tsc --noEmit`).

---

### U2. Auto-create default SCOPING Project on Contact creation

**Goal:** Implement R14 — every new Contact gets a default Project in `SCOPING` created atomically in the same transaction.

**Requirements:** R14, AE10 (thread available before project is named)

**Dependencies:** none

**Files:**
- Modify: `src/modules/contacts/contacts.service.ts`

**Approach:**

Inside the existing `this.prisma.$transaction` in `create()`, add a `tx.project.create()` call after `tx.thread.create()`:

- `name`: `dto.company ?? dto.name` (company name if set, otherwise contact name)
- `stage`: `SCOPING`
- `contactId`: the newly created contact's `id`
- `workspaceId`

No other fields required at creation time. The freelancer renames and fills in budget/dates later.

Note: The Project model must already have `contactId` and `stage` fields from Phase A migrations. Confirm `ProjectStage` enum includes `SCOPING` before implementing.

**Patterns to follow:** The existing `tx.thread.create()` call immediately below the `tx.contact.create()` in the same method.

**Test scenarios:**
- Creating a Contact via POST `/contacts` returns 201. Immediately after, `GET /projects?contactId=<id>` returns one Project with `stage=SCOPING` and `name=<company or name>`.
- Creating a Contact with `company="Sharma Digital"` → Project name is `"Sharma Digital"`.
- Creating a Contact with no company, `name="Rahul Sharma"` → Project name is `"Rahul Sharma"`.
- Transaction failure (e.g., thread creation fails) → Contact is not created (full rollback).

**Verification:** `GET /contacts/:id` includes `_count.projects: 1` for a newly created contact.

---

### U3. Block last-Project deletion in ProjectsService

**Goal:** Implement R15 / AE6 — prevent deleting a Contact's only remaining Project.

**Requirements:** R15, AE6

**Dependencies:** none

**Files:**
- Modify: `src/modules/projects/projects.service.ts`

**Approach:**

In `remove(workspaceId, id)`, before the existing guard that checks for attached documents, add:

```
const project = await prisma.project.findFirst({ where: { id, workspaceId }, select: { contactId: true } })
if (project?.contactId) {
  const count = await prisma.project.count({ where: { contactId: project.contactId, workspaceId } })
  if (count <= 1) throw new BadRequestException('A contact must always have at least one project.')
}
```

Projects not linked to a Contact (edge case from partial migration) are unguarded.

**Patterns to follow:** The existing document-check guard immediately below in the same `remove()` method (lines ~228–246 of `projects.service.ts`).

**Test scenarios:**
- DELETE `/projects/:id` where the Contact has only one Project → 400 with message "A contact must always have at least one project."
- DELETE `/projects/:id` where the Contact has two Projects → succeeds (200), remaining Project count is 1.
- DELETE `/projects/:id` not linked to any Contact → succeeds (existing behavior unchanged).

**Verification:** AE6 scenario passes end-to-end.

---

### U4. Auto-advance Contact PAST_CLIENT → CLIENT on new Project creation

**Goal:** Implement R22 / AE8 — creating a new Project on a PAST_CLIENT contact automatically advances the Contact to CLIENT.

**Requirements:** R22, AE8

**Dependencies:** U2 (project creation already creates default project; this adds the stage side-effect for explicitly created projects)

**Files:**
- Modify: `src/modules/projects/projects.service.ts`

**Approach:**

In the project `create()` method, after the project is inserted, check whether the linked Contact is in `PAST_CLIENT`. If so, update the Contact to `CLIENT`.

```
if (dto.contactId) {
  const contact = await prisma.contact.findUnique({ where: { id: dto.contactId }, select: { stage: true } })
  if (contact?.stage === 'PAST_CLIENT') {
    await prisma.contact.update({ where: { id: dto.contactId }, data: { stage: 'CLIENT', lastActivityAt: new Date() } })
    eventEmitter.emit('contact.stage_changed', { entityId: dto.contactId, workspaceId, stage: 'CLIENT' })
  }
}
```

This check does NOT apply to the default-project created in U2 (Contact is always ENQUIRY at that moment, never PAST_CLIENT).

**Patterns to follow:** The `advanceStage()` pattern in `stage-advance.service.ts`.

**Test scenarios:**
- Create a Project on a `CLIENT` Contact → Contact stays `CLIENT`.
- Create a Project on a `PAST_CLIENT` Contact → Contact advances to `CLIENT` (AE8).
- Create a Project on a `NEGOTIATING` Contact → Contact stays `NEGOTIATING` (only PAST_CLIENT triggers this advance).

**Verification:** AE8 passes. `GET /contacts/:id` shows `stage: 'CLIENT'` after the project is created.

---

### U5. Contact detail page (`/contacts/:id`)

**Goal:** Implement R30 — the primary UX surface of the unified model. A single page showing the full relationship lifecycle: identity, projects with inline documents, message thread, and meetings.

**Requirements:** R30, R11 (manual stage transitions), R13 (new project creation), F1, F2, F3, F4, F5

**Dependencies:** U2 (so newly created contacts always have a project to show)

**Files:**
- Create: `src/pages/app/ContactPage.tsx`
- Create: `src/features/contacts/components/ContactStagePicker.tsx`
- Create: `src/features/contacts/components/ContactProjectAccordion.tsx`
- Create: `src/features/contacts/components/ContactThreadSection.tsx`
- Create: `src/features/contacts/components/ContactMeetingsSection.tsx`
- Create: `src/features/contacts/components/EditContactModal.tsx`
- Modify: `src/router/index.tsx` (add `/contacts/:id` route — see U10)
- Modify: `src/features/contacts/hooks/useContacts.ts` (add `useContactProjects`, `useContactThread`, `useContactMeetings` hooks)

**Approach:**

**Page structure (two-column, responsive):**
- Sticky header bar: back chevron, contact name, company, stage badge (opens `ContactStagePicker`), edit button, action menu (archive, portal link copy, delete).
- Left sidebar (280px, sticky on scroll): contact meta card (email, phone, GST, state, source, deal value, service, follow-up date with overdue highlight, notes), portal link section with copy button.
- Right main area (flex): three stacked sections separated by dividers:
  1. **Projects** — section header with "Projects" label and "+ New Project" button. List of `ContactProjectAccordion` cards, ordered by `updatedAt desc`.
  2. **Thread** — `ContactThreadSection` renders the message thread using the existing inbox thread UI component.
  3. **Meetings** — `ContactMeetingsSection` renders past and upcoming meetings, each with project label if linked.

**ContactProjectAccordion:** Each Project is a collapsible card.
- Collapsed (default for all but the most recently active): project name, stage badge (color coded), budget (₹), start–end date range.
- Expanded: tabbed sub-sections — Proposals (list), Contracts (list), Invoices (list with amount + status), Tasks (count + link to tasks page). Each sub-list item opens the existing quick-view component (InvoiceQuickView, ProposalQuickView, ContractQuickView from ClientPage).
- The most recently active Project (highest `updatedAt`) is expanded by default on page load.
- Action row at bottom of expanded card: "New Proposal", "New Contract", "New Invoice" — each links to the relevant editor page with `contactId` and `projectId` pre-filled.

**ContactStagePicker:** A popover/dropdown triggered by clicking the stage badge. Shows the valid next stages for the current stage (derived from the R11 transition table). Each option has a label and description (e.g., "Mark as Lost" shows "No more active proposals"). Calls `PATCH /contacts/:id/stage`.

**Data fetching:** `useContact(id)` already exists. Add `useContactProjects(contactId)` calling `GET /projects?contactId=<id>&limit=50&orderBy=updatedAt`. Add `useContactThread(contactId)` calling `GET /threads?contactId=<id>`. `useContactMeetings(contactId)` calling `GET /meetings?contactId=<id>`.

**Mobile:** Left sidebar collapses to a summary strip (name, stage badge, deal value inline). Main area takes full width. Projects/Thread/Meetings remain full width.

**Patterns to follow:** `src/pages/app/ClientPage.tsx` for overall layout, quick-view components, action modal patterns. `src/features/messages/` for thread rendering. `STAGE_COLORS` from `src/features/contacts/schemas/contact.schema.ts` for stage badge colors.

**Test scenarios:**
- `/contacts/:id` loads for a contact with 2 projects → shows both project cards; most-recently-updated is expanded.
- Expanding a project card that has 2 invoices → both invoices listed with status badges.
- Clicking stage badge → `ContactStagePicker` shows correct valid transitions for current stage (e.g., CLIENT → only "Past Client" and "Lost" are offered). Selecting "Mark as Client" → `PATCH` succeeds, badge updates without page reload.
- "+ New Project" button → calls `POST /projects` with `contactId`, new project card appears in the list.
- Thread section shows the message history. Sending a new message calls the existing send-message API.
- Overdue follow-up date shows a warning indicator in the sidebar.
- Archive action → contact is archived, navigate back to `/contacts`.
- Page is readable on 375px mobile (sidebar collapses, full-width cards).

**Verification:** All flows F1–F5 are exercisable from this page. No TypeScript errors.

---

### U6. Pipeline view (`/pipeline`) with Project kanban

**Goal:** Implement R27 / AE7 — a dedicated page showing Projects as pipeline cards, replacing the Contact-card kanban.

**Requirements:** R27, AE7

**Dependencies:** U1 (Project stage is now auto-advanced, so cards move automatically after document events)

**Files:**
- Create: `src/pages/app/PipelinePage.tsx`
- Create: `src/features/projects/components/PipelineKanban.tsx`
- Create: `src/features/projects/components/PipelineCard.tsx`
- Create: `src/features/projects/hooks/usePipelineProjects.ts`
- Modify: `src/router/index.tsx` (add `/pipeline` route — see U10)
- Modify: `src/components/layout/Sidebar.tsx` (add Pipeline nav item — see U10)

**Approach:**

**Page layout:**
- Header: "Pipeline" title, pipeline value (sum of `dealValue` for SCOPING + PROPOSAL_SENT contacts — using existing backend aggregation), filter pills (by source, by date added).
- Negotiating sidebar (right, collapsible): contacts in NEGOTIATING stage — shown as a list of names + deal value. Toggle button: "Negotiating (N)". Clicking an item → `/contacts/:id`.
- Main kanban: 2 columns — `SCOPING` and `PROPOSAL_SENT`. Each column shows its count + sum of deal values.

**PipelineCard:**
- Primary: Project name (bold, 14px)
- Secondary: Contact name (gray, 12px), linked with a contact icon
- Deal value (₹ formatted, right-aligned)
- Stage duration: "N days in stage" (calculated from `stageEnteredAt` or `updatedAt`)
- Stage badge not shown on card (it's implied by column position)
- Hover: show quick-action row — "View Contact" (→ `/contacts/:id`), "New Invoice"

**DnD:** Use `@dnd-kit/core` (already in project). Dragging a card to the other column calls `PATCH /projects/:id/stage`. Optimistic update — revert on error.

**Data:** `usePipelineProjects()` calls `GET /projects?stage=SCOPING,PROPOSAL_SENT&limit=200&orderBy=updatedAt`. Projects are grouped by stage client-side.

**Negotiating contacts:** separate query `GET /contacts?stage=NEGOTIATING&limit=100`.

**Patterns to follow:** `src/features/contacts/components/ContactsKanban.tsx` for DnD setup. `src/features/contacts/components/ContactsTable.tsx` for card styling conventions. `STAGE_COLORS` for badge colors.

**Test scenarios:**
- `/pipeline` loads with 3 SCOPING projects and 2 PROPOSAL_SENT projects → correct column counts.
- Dragging a SCOPING card to PROPOSAL_SENT column → optimistic move, `PATCH /projects/:id/stage` fires, card stays in new column on success.
- Dragging fails (400 from API) → card reverts to original column with toast error.
- Clicking "View Contact" on a card → navigates to `/contacts/:id` for that project's contact.
- Negotiating sidebar toggle: click "Negotiating (3)" → sidebar expands showing 3 contact names.
- Pipeline value header shows correct total (sum of SCOPING + PROPOSAL_SENT contact deal values).

**Verification:** AE7 — "Sharma Website Redesign" card shows in PROPOSAL_SENT column with "Rahul Sharma" as secondary label.

---

### U7. Clients view migration to Contact API

**Goal:** Implement R28 / AE5 — `/clients` reads from Contact API (stage=CLIENT or PAST_CLIENT), with a collapsible "Past clients" section.

**Requirements:** R28, AE5

**Dependencies:** none (parallel to other frontend units)

**Files:**
- Modify: `src/pages/app/ClientsPage.tsx`
- Create or modify: `src/features/clients/hooks/useClients.ts` (add `useContactClients` hook)
- Modify: `src/router/index.tsx` (keep `/clients` route, keep `/clients/:id` redirecting to `/contacts/:id`)

**Approach:**

Replace the existing `useClients` call in `ClientsPage.tsx` with a new `useContactClients()` hook that calls `GET /contacts?stage=CLIENT,PAST_CLIENT&limit=200` (using the existing contacts API's `stage` multi-value filter).

**Page layout changes:**
- Section 1: CLIENT contacts — same table/card layout as before. Each row shows: name, company, # active projects, last activity, deal value. Click → `/contacts/:id`.
- Section 2: collapsible "Past clients (N)" toggle at bottom. When expanded, shows PAST_CLIENT contacts in a muted list. Click → `/contacts/:id`.
- Expandable rows (ACTIVE projects): clicking a CLIENT-stage contact row expands an inline sub-row showing its ACTIVE projects. Call `GET /projects?contactId=<id>&stage=ACTIVE` on expand.

Keep the existing header, search bar, and filter UX. Remove the "Convert to Lead" button (no conversion concept).

The `/clients/:id` route should redirect to `/contacts/:id` for link compatibility.

**Patterns to follow:** Existing `ClientsPage.tsx` layout. `useContacts` hook from `src/features/contacts/hooks/useContacts.ts` for the API call shape.

**Test scenarios:**
- `/clients` loads 5 CLIENT contacts and 2 PAST_CLIENT contacts → 5 rows in main list, "Past clients (2)" toggle at bottom.
- Clicking "Past clients (2)" expands to show 2 muted rows.
- Clicking a CLIENT row → navigates to `/contacts/:id`.
- Expanding a CLIENT row → shows its ACTIVE projects inline. Projects with no budget show "–" in the value column.
- Legacy URL `/clients/:id` → redirects to `/contacts/:id`.

**Verification:** AE5 passes. "Past clients" section visible without extra filter toggle.

---

### U8. Contacts page — remove kanban, add cards view, wire click to detail

**Goal:** Update the Contacts page (U11) to remove the kanban toggle, add a cards grid view, and wire click-to-detail navigation.

**Requirements:** R29 (all contacts view with table and cards)

**Dependencies:** U5 (detail page must exist before linking to it)

**Files:**
- Modify: `src/pages/app/ContactsPage.tsx`
- Modify: `src/features/contacts/components/ContactsTable.tsx` (make rows clickable)
- Create: `src/features/contacts/components/ContactsCards.tsx` (new cards grid view)
- Remove: `src/features/contacts/components/ContactsKanban.tsx` (delete file — replaced by `/pipeline`)
- Modify: `src/features/contacts/index.ts` (remove ContactsKanban export)

**Approach:**

In `ContactsPage.tsx`:
- Remove the kanban/table toggle. Replace with a table/cards toggle only.
- Replace `ContactsKanban` import/usage with `ContactsCards`.
- Remove the stub `openContact` modal entirely — clicking a contact row or card navigates to `/contacts/:id` using `useNavigate`.
- Remove the `@dnd-kit` imports (no longer needed on this page).

`ContactsCards` component: a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`). Each card:
- Name (bold), company (secondary)
- Stage badge (uses STAGE_COLORS)
- Deal value (₹, or "–" if null)
- Follow-up date (red text if overdue, yellow if this week)
- Source label
- Cursor pointer, hover shadow lift
- Click → `navigate('/contacts/' + contact.id)`

In `ContactsTable.tsx`: make each row a clickable link (use `useNavigate` on row click). Remove the `onOpen` prop.

**Patterns to follow:** `ContactsTable.tsx` for styling conventions. `STAGE_COLORS` and `STAGE_LABELS` from the schema file.

**Test scenarios:**
- Contacts page loads in table view → clicking a row navigates to `/contacts/:id`.
- Toggling to cards view → grid of contact cards renders with name, stage badge, deal value.
- Clicking a contact card → navigates to `/contacts/:id`.
- Stage filter pill works in both table and cards view.
- Archiving a contact from the detail page (U5) → navigating back to `/contacts` shows the contact gone from default view (archivedAt filter).

**Verification:** No imports of `ContactsKanban` remain. TypeScript `--noEmit` passes.

---

### U9. Inbox — show contact name when client is null

**Goal:** Fix the inbox thread list so migrated threads (contactId-only, no clientId) show the contact's name.

**Requirements:** R24 (thread on Contact from creation)

**Dependencies:** none

**Files:**
- Modify: `src/pages/app/InboxPage.tsx` (or relevant thread list component — locate the thread display logic)
- Modify: `src/features/messages/hooks/useMessages.ts` (ensure thread query includes `contact { name, company }`)

**Approach:**

Find where thread display name is rendered (likely `thread.client?.name ?? 'Unknown'`). Change to:

```
thread.contact?.name ?? thread.client?.name ?? 'Unknown'
```

The backend thread query in `messages.service.ts` (or equivalent) must include `contact: { select: { name: true, company: true } }` in its Prisma include. Add if missing.

**Patterns to follow:** Existing `thread.client?.name` usage in InboxPage or the thread list component.

**Test scenarios:**
- A thread with `contactId` set and `clientId` null → inbox shows the contact's name.
- A thread with both `contactId` and `clientId` → inbox shows contact name (primary).
- A thread with only `clientId` (old legacy thread) → shows client name (fallback, unchanged).

**Verification:** No "Unknown" threads in inbox for contacts created after migration.

---

### U10. Router + Sidebar nav updates

**Goal:** Wire `/contacts/:id`, `/pipeline`, and the updated `/clients` route. Add Pipeline to sidebar nav.

**Requirements:** Navigation plumbing for all new pages.

**Dependencies:** U5, U6, U7, U8 (page components must exist)

**Files:**
- Modify: `src/router/index.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Approach:**

In `router/index.tsx`:
- Add lazy route for `/contacts/:id` → `ContactPage`
- Add lazy route for `/pipeline` → `PipelinePage`
- Change `/clients/:id` route to `<Navigate to="/contacts/:id" replace />` (requires extracting `:id` — use a wrapper component or `loader`)

In `Sidebar.tsx`:
- Add `{ id: 'pipeline', icon: Kanban, label: 'Pipeline', href: '/pipeline', permission: Permission.VIEW_LEADS }` to `ALL_NAV_ITEMS`.
- Insert `'pipeline'` into `SECTIONS[0].ids` between `'contacts'` and `'leads'`.
- Import `Kanban` from `lucide-react` (already available).

**Test scenarios:**
- Navigating to `/pipeline` renders `PipelinePage`.
- Navigating to `/contacts/some-id` renders `ContactPage`.
- Navigating to `/clients/some-id` redirects to `/contacts/some-id`.
- "Pipeline" nav item is visible in sidebar and highlights when on `/pipeline`.

**Verification:** No 404s on new routes. TypeScript `--noEmit` passes.

---

## Scope Boundaries

### In scope
- All units U1–U10 above.
- Both pakka-api and pakka-app changes.

### Deferred to follow-up work
- Phase D migration (NOT NULL enforcement) — apply only after Phase C is stable in production.
- Phase E (drop legacy `leads` and `clients` tables, remove dual-write code) — separate sprint.
- R19 triple-FK elimination (documents belong to Project only) — requires Phase E schema changes.
- `NEGOTIATING` as a full kanban column in Pipeline — deferred per scope boundary in requirements doc.
- Automation rules triggered by stage changes.
- `GET /projects/:id/stage` endpoint if not yet implemented (needed for U6 project stage badge on detail page; verify at implementation time).
- Notes consolidation (`ClientNote` → `ContactNote` merge) — kept as two tables; Contact detail renders both via union query.

### Out of scope
- Changes to lead acquisition modules (`discovered-leads`, `lead-campaigns`, etc.).
- Multi-currency or GST calculation changes.
- SMS/WhatsApp outbound send from Thread.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|-----------|
| `ProjectStage` enum may not yet have `SCOPING` in Prisma schema if Phase A migration was partial | Verify `ProjectStage` enum in `prisma/schema.prisma` before U1 and U2 |
| `project.projectId` may not exist on Invoice/Proposal/Contract if dual-write not complete | U1 looks up project via `proposal.projectId` — if null, Project stage advance silently skips (acceptable for Phase C) |
| `GET /projects?contactId=<id>` may not be implemented on the projects controller | Check QueryProjectsDto and controller; add `contactId` filter if missing |
| ClientsPage has complex existing UI (rate limits, invite, etc.) | Preserve all existing UI; only swap the data source from clients API to contacts API |
| ContactsKanban deletion — no other page imports it | Grep for imports before deleting to confirm |

---

## Open Questions (deferred to implementation)

- Does `GET /projects?stage=SCOPING,PROPOSAL_SENT` (comma-separated multi-value) already work on the projects controller, or does it need a `stages[]` array param? Verify at implementation time.
- Does `GET /contacts?stage=CLIENT,PAST_CLIENT` support multi-value `stage` filtering? The current `QueryContactsDto` accepts a single `stage`. May need to add `stages[]` array support.
- What is the existing thread query include shape in the backend messages service? Confirm it includes `contact { name, company }` or add it.
- Does the Contact detail page need to call a separate `/threads?contactId=<id>` endpoint, or does the existing `/inbox` data structure serve it? Check existing messages API.

---

## Sources & Research

- Requirements doc: `docs/brainstorms/2026-07-07-unified-contact-entity-requirements.md`
- Existing ClientPage pattern: `src/pages/app/ClientPage.tsx` (783 lines, tabs layout — superseded by U5)
- StageAdvanceService bugs confirmed via code review: `src/modules/contacts/stage-advance.service.ts`
- Auto-create gap confirmed: `src/modules/contacts/contacts.service.ts` `create()` method — Thread created, Project not
- Project deletion guard gap: `src/modules/projects/projects.service.ts` `remove()` method — no last-project check
