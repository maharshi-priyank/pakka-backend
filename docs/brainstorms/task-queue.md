# ClearWork — Running Task Queue

Tracks implementation sprints in order. Completed sprints are ticked; pending items are queued.
Each sprint links back to the flow ID in `2026-08-07-journey-lifecycle-requirements.md`.

---

## Sprint: F0c — Proposal → Contract UX (Completed 2026-08-07)

- [x] Proposal preview drawer — "View Contract" CTA + "Contract draft ready" green banner
- [x] Backend notification: `contract.auto_created` event → in-app notification with deep-link to contract
- [x] Backend: `lostReason String?` field added to `Contact` model (`prisma db push`)
- [x] API: `UpdateStageDto` accepts optional `lostReason`; `contactsService.updateStage` saves/clears it
- [x] Frontend hook: `useUpdateContactStage` + `updateContactStage` forward `lostReason`
- [x] UI: `ContactStagePicker` — intercepts LOST selection, shows 7-option reason picker + "Other" freetext before calling mutate
- [x] Build verification: `npm run build` 0 errors (pakka-app + pakka-api type-check)

---

## Sprint: FN1 — Unified Leads Tab (Completed 2026-08-07)

> Merge `lead-capture` + pipeline nav items into a single `/leads` tab with Pipeline (default) and Capture sub-tabs.
> Reference: FN1 in requirements doc.

- [x] Remove `lead-capture` from `navItems.ts`; add `leads` item → `/leads` with `GitBranch` icon
- [x] Update `SECTIONS` array in `navItems.ts` (`lead-capture` → `leads`)
- [x] Rewrite `LeadsPage.tsx` with sub-tab bar: "Pipeline" | "Capture" (URL param `?tab=`)
- [x] Pipeline sub-tab: full leads kanban + table + filters + Add Lead / AI / Find Leads CTAs
- [x] Capture sub-tab: embed code panel (iframe snippet + copy button + public URL) + form submissions inbox (dismiss / convert)
- [x] Update router: `/lead-capture` → `<Navigate to="/leads?tab=capture" replace />`
- [x] Build verification: `npm run build` 0 errors
- [ ] Unread badge on Capture sub-tab (deferred — requires backend count endpoint)

---

## Sprint: FN2 — Projects as Pipeline-First (Completed 2026-08-07)

> `ProjectsPage` defaults to kanban view (absorbs `PipelinePage`); grid view becomes a toggle; `/pipeline` retired.
> Reference: FN2 in requirements doc.

- [x] Move kanban column + card logic from `PipelinePage.tsx` into `ProjectsPage.tsx`
- [x] Add "Pipeline / List" view toggle in `ProjectsPage` header (default: Pipeline)
- [x] Clicking a project card in kanban navigates to `/projects/:id`
- [x] Delete (or redirect) `/pipeline` route → `<Navigate to="/projects" replace />`
- [x] Remove `pipeline` nav item from `ALL_NAV_ITEMS` and `SECTIONS`
- [x] Persist view preference in localStorage (`clearwork_projects_view`)
- [x] Build verification: `npm run build` 0 errors

---

## Sprint: FN3 — Customizable Lead Pipeline Stages (Deferred — backend-heavy)

> Allow workspaces to rename, recolor, reorder, add, and delete active pipeline stages.
> Reference: FN3 in requirements doc. Do after FN1 + FN2.

- [ ] Backend: design `WorkspacePipelineStage` model and migration strategy
- [ ] Backend: seed default stages on first access; handle `Contact.stage` reference migration
- [ ] API: CRUD endpoints for workspace pipeline stages (`GET/POST/PATCH/DELETE /pipeline-stages`)
- [ ] Frontend hook: `usePipelineStages` (fetch + mutate)
- [ ] Frontend UI: "Manage Stages" modal — drag-to-reorder, color picker, rename, add, delete with guard
- [ ] Leads kanban: read columns dynamically from workspace stages instead of hardcoded array
- [ ] Locked system stages (CLIENT, PAST_CLIENT, LOST) shown read-only in modal

---

## Backlog (from full requirements doc — not yet started)

- [ ] F0a — Lead entry UX: enquiry inbox, discovered lead import, intake form → Contact conversion
- [ ] F0b — Lead pipeline qualification UX: notes, follow-up nudges, deal value updates
- [ ] F1 — Project initiation from accepted proposal
- [ ] F2 — Client-visible tasks (per-task toggle + portal board view)
- [ ] F3 — Project updates feed (freelancer posts, client reads + replies)
- [ ] F4 — Change request workflow (raise, respond, approve, auto-invoice)
- [ ] F5 — Deliverables & file sharing (isDeliverable flag, portal Deliverables tab)
- [ ] F6 — Project sign-off (OTP-verified, auto-complete tasks)
- [ ] F7 — Post-project review submission and 24h publish window
- [ ] F8 — Reviews section on public profile
- [ ] Landing page journey section (12-step Priya + Raj scrollytelling)
- [ ] Migrate Proposals / Contracts / Invoices create forms → Contact picker (plan exists in `.claude/plans/`)
