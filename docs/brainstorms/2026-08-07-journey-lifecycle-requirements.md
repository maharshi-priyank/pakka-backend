---
title: Full Project Lifecycle — Lead to Client Conversion, Project Delivery, and Review
date: 2026-08-07
status: draft
type: requirements
---

# Full Project Lifecycle — Lead to Client Conversion, Project Delivery, and Review

## Problem

ClearWork has two gaps — one at the top and one at the bottom of the client lifecycle.

**Top-of-funnel gap:** A lead enters the system (via public profile enquiry, discovered lead campaign, manual entry, or intake form), but the qualification and conversion process — the steps between "someone is interested" and "they are now a paying client" — has no guided workflow. There is no visibility into pipeline health, no automatic stage transitions, and no defined path from enquiry to signed contract.

**Bottom-of-funnel gap:** Once an invoice is paid, ClearWork goes silent. The actual project delivery — task visibility, progress updates to the client, change request handling, final sign-off, and post-project reviews — has no product support. Clients experience delivery through WhatsApp. Freelancers track team work in Notion. Reviews never reach a profile page.

The platform looks incomplete at both ends. The landing page reflects the same gap — the existing HowItWorks section shows 6 steps from lead to automation, but never shows the full arc from enquiry to happy client.

---

## Actors

- **A1 — Freelancer / Agency owner** — manages the full pipeline from lead entry to project completion; sends proposals, responds to change requests, posts updates, marks project complete, receives the review
- **A2 — Agency team member** — gets tasks assigned in the workspace, has role-based access
- **A3 — Prospect / Lead** — someone interested in working with the freelancer, not yet committed; interacts via enquiry form or direct outreach
- **A4 — Client** — a converted contact; uses the token-based portal (no account required) to view project progress, raise change requests, sign off on delivery, and submit a review
- **A5 — Public visitor** — browses the freelancer's public profile to see reviews, stats, and past work; may become a prospect via the enquiry form

---

## Core Outcome

A freelancer using ClearWork should be able to manage the complete business cycle in one place: from a lead appearing (however it arrived) through qualification, proposal, contract, active project delivery, client communication, change management, final sign-off, and an earned public review.

A client should experience the entire engagement without ever needing WhatsApp or email to understand where things stand.

---

## User Flows

### F0a — Lead Entry (all inbound channels)

A lead can enter ClearWork from four paths. All four result in a `Contact` record at `ENQUIRY` stage (or a `DiscoveredLead` pending import).

**Path 1 — Public profile enquiry:**
1. A visitor (A5) finds the freelancer's public profile and fills the enquiry form (name, phone/email, service needed, brief, budget).
2. A `PublicProfileEnquiry` record is created.
3. Freelancer receives a push + email notification: "New enquiry from [Name]."
4. Freelancer reviews the enquiry and either:
   - **Converts** it — creates a Contact at `ENQUIRY` stage with the enquiry data pre-filled.
   - **Dismisses** it — marks it as not relevant (stays in the enquiry log).

**Path 2 — Manual lead entry:**
1. Freelancer manually adds a contact (from a WhatsApp message, referral, event, cold outreach, etc.).
2. Contact created directly at `ENQUIRY` stage with freelancer-entered details.
3. Source field records how they found this lead (WhatsApp, referral, cold outreach, etc.).

**Path 3 — Discovered lead (AI campaign):**
1. Freelancer runs a lead campaign targeting a segment (e.g. "Mumbai-based e-commerce startups").
2. `DiscoveredLead` records are created from external providers.
3. Freelancer reviews the discovered leads list and imports selected ones.
4. Import creates a Contact at `ENQUIRY` stage. `importedAsContactId` on the discovered lead is set.

**Path 4 — Intake form submission:**
1. Freelancer shares an intake form link (via WhatsApp, email, or website).
2. Client fills the form.
3. An `IntakeFormSubmission` is created and surfaces in the freelancer's CRM as a new lead at `ENQUIRY` stage with all form fields pre-mapped to the Contact record.

**Edge cases:**
- Duplicate detection: if a contact with the same email already exists in the workspace, the system warns the freelancer before creating a duplicate.
- Enquiry with no email and no phone: allowed — freelancer may only have a name and social handle at this point.
- Discovered lead already exists as a contact: import is blocked with a "This lead is already in your CRM" notice.

---

### F0b — Lead Pipeline & Qualification

The CRM pipeline shows all Contacts with stages `ENQUIRY`, `PROPOSAL_SENT`, and `NEGOTIATING` as active pipeline entries.

1. Freelancer views the pipeline board (kanban view by stage, or list view).
2. Each contact card shows: name, company, deal value, source, days since last activity, next follow-up date.
3. Freelancer qualifies the lead — may:
   - Add a note (internal, not visible to the contact).
   - Schedule a meeting (uses existing Meetings module).
   - Set a follow-up date (surfaces in the freelancer's calendar and ClearWork reminders).
   - Update the deal value.
4. When ready to proceed: freelancer creates a proposal from the contact → stage auto-advances to `PROPOSAL_SENT`.

**Edge cases:**
- Lead unresponsive after 14 days: freelancer gets a "Follow up?" nudge notification.
- Freelancer marks a lead as `LOST` (with an optional reason): contact removed from active pipeline. Reason captured for win/loss analytics.
- Lead at `NEGOTIATING`: freelancer may send a revised proposal (second proposal linked to same contact). Stage stays `NEGOTIATING` until one proposal is accepted.
- Lead converts to client via a different channel (they paid directly) without going through a formal proposal: freelancer can manually move the stage to `CLIENT`.

---

### F0c — Proposal, Acceptance, and Client Conversion

1. Freelancer sends a proposal from the contact record (existing proposal flow).
2. Contact stage advances from `ENQUIRY` → `PROPOSAL_SENT`.
3. If the client negotiates: stage moves to `NEGOTIATING`; freelancer may send a revised proposal.
4. **Client accepts the proposal:**
   - Contact stage advances to `CLIENT`.
   - Proposal status → `ACCEPTED`.
   - Freelancer is prompted: "Create a contract from this proposal?" (one-click convert, existing flow).
5. **Client signs the contract:**
   - Contract status → `SIGNED`.
   - Freelancer is prompted: "Start the project?" → creates a Project linked to this contact.
   - OR: the contact's existing project (if pre-created during scoping) moves to `ACTIVE` stage.
6. Contact now appears in the **Clients** view (not just pipeline), with their full history: proposals, contract, invoices, and the new project.

**Edge cases:**
- Client accepts the proposal verbally but doesn't sign the contract: stage stays at `CLIENT` (proposal accepted), contract stays `SENT`. Freelancer sees an "Awaiting signature" status on the contact card.
- Proposal expires before the client accepts: stage reverts to `ENQUIRY` if freelancer wants to re-engage; they can send a new proposal.
- Multiple proposals sent to the same contact: only the accepted one triggers the stage change. Others remain as historical records.
- Client declines: stage moves to `LOST` with reason "Proposal declined."

---

### F1 — Project Initiation

1. Freelancer creates a project (can be linked from an accepted proposal or created standalone).
2. Sets project name, start/end date, budget, and team members.
3. Project stage moves from `PROPOSAL_SENT` → `ACTIVE` when work begins.
4. Client's portal now shows the project card with status `In Progress`.

### F2 — Task Management (Freelancer view)

1. Freelancer creates tasks inside the project (existing Kanban board).
2. Each task has a **"Visible to client" toggle** (defaults off).
3. Tasks marked client-visible appear in the client's portal under a "Project Board" view.
4. Freelancer assigns tasks to workspace members. Each assigned task optionally records a **payout amount** (cost to owner) for profitability tracking.
5. Task statuses flow through board columns. `isDone: true` columns count toward project completion percentage.

**Edge cases:**
- If a team member is removed from the workspace mid-project, their tasks remain assigned (with a "removed member" label) until reassigned.
- If a client-visible task is deleted, it disappears from the portal immediately with no notification (silent removal).
- Private tasks (not client-visible) never appear in the portal regardless of status.

### F3 — Project Updates (Communication feed)

1. Freelancer posts a **project update** — text, optionally with file attachments — to the project.
2. Update appears in the client's portal under a "Updates" tab on the project.
3. Client receives an email/WhatsApp notification for each new update (using existing notification system).
4. Updates are append-only — no editing or deletion after posting (audit trail).
5. Client can **react or reply** to an update with a short text comment from the portal (no account needed, uses portal token identity).

**Edge cases:**
- Project on hold: freelancer can still post updates; client can see them.
- Cancelled project: portal shows a "This project has been cancelled" notice; no new updates can be posted.

### F4 — Change Request Workflow

1. **Client raises a change request** from the portal: describes the change in text (required) + optionally attaches a reference file.
2. Freelancer is notified (push + email + WhatsApp).
3. Freelancer reviews and responds with one of:
   - **In-scope** — change is included in the existing contract, no price impact. Marked resolved.
   - **Additional cost** — freelancer states the additional price (amount + description). Client is asked to approve or reject.
   - **Not feasible** — freelancer explains why and closes the request.
4. If **client approves an additional cost**:
   - A new invoice is auto-generated for the additional amount, linked to the project.
   - Change request status moves to `Approved — Invoice Sent`.
   - Project proceeds only after this invoice is paid (or freelancer overrides).
5. If **client rejects the additional cost**: the change request is closed with status `Rejected`. Client can raise a new one.
6. If **freelancer marks in-scope**: change request is marked `Resolved — In Scope`. Freelancer adds the scope change to their tasks.

**Edge cases:**
- Multiple simultaneous change requests allowed (each tracked independently).
- Client cannot raise a change request after project sign-off (project is COMPLETED).
- If the additional cost invoice goes unpaid for 30 days, freelancer gets a reminder; the change request stays open until paid.
- Change request raised after final invoice is fully paid but before sign-off: allowed — triggers new invoice flow.
- Freelancer can delete a change request only if it is in `Pending Review` status (not yet responded to).

### F5 — Deliverables & File Sharing

1. Freelancer uploads deliverable files to the project (using existing `Attachment` model).
2. Deliverables are tagged as **"Deliverable"** (vs general project files) via a `isDeliverable` flag.
3. Deliverables appear in the client portal under a "Deliverables" tab.
4. Client can download deliverables directly from the portal (no payment gate required — files are for delivery, not gated).
5. Freelancer can mark a deliverable as the **"Final Version"** — this file is highlighted in the client's portal view.

**Edge cases:**
- Freelancer can replace a deliverable (upload a new version) — old version stays in history but is no longer the active file shown to the client.
- Client tries to download before project is marked active: downloads work as soon as the file is uploaded.

### F6 — Project Sign-off & Completion

1. Freelancer clicks **"Request Project Sign-off"** when they believe the project is done.
2. Client receives a notification: "Your project [name] is complete — please review and sign off."
3. Client lands on a **Project Sign-off page** in the portal — showing:
   - Summary of deliverables uploaded
   - Summary of change requests resolved
   - Final invoice status
4. Client clicks **"Approve & Sign Off"** (with OTP verification for legal validity, same pattern as contracts).
5. On sign-off:
   - Project status → `COMPLETED`
   - All open tasks are auto-marked done.
   - A **review request** is sent to the client (email + portal notification).
6. If client clicks **"Request Revision"** instead of approving: freelancer is notified with the client's feedback text. Project stays `ACTIVE`.

**Edge cases:**
- Freelancer cannot request sign-off while any change request is in `Pending Client Approval` status.
- Freelancer cannot request sign-off while any project invoice is unpaid (configurable: warn vs block).
- If client ignores the sign-off request for 14 days, freelancer can send a reminder or manually mark complete (override) with a note.
- Client clicks "Approve" but OTP delivery fails: fallback to email verification link.

### F7 — Post-Project Review

1. After sign-off, client receives a **review request**: "How was your experience working with [Freelancer/Agency]?"
2. Review form (in portal, no account needed):
   - Star rating 1–5 (required)
   - Overall experience text (required, min 20 chars)
   - Optional: per-dimension ratings (Communication, Quality, Timeline, Value) — each 1–5
3. Client submits review.
4. Review is **pending** for 24 hours (allows client to edit or retract).
5. After 24 hours, review is **published** to the freelancer's public profile.
6. Freelancer is notified when review goes live.
7. Freelancer can post a **public reply** to the review (shown under the review on the public profile).

**Edge cases:**
- Client skips the review: gets a reminder at day 7 and day 14. After 30 days the review request expires.
- Client submits a review, then wants to change it: editable within 24 hours of submission, not after publishing.
- Freelancer disputes a review (claims it's fake or abusive): flagging mechanism → review is hidden pending admin decision. (Admin tooling out of scope for V1 — flagged reviews stay visible with a "Under Review" note.)
- Duplicate review: a client can only submit one review per project, not per freelancer.
- Anonymous reviews: not allowed — client portal token identity links to the Contact record.

### F8 — Reviews on Public Profile

1. New **"Reviews" section** added to the existing public profile page.
2. Shows: average star rating, total review count, individual review cards (text, rating, project type if freelancer chose to make it visible, date).
3. Freelancer's reply (if any) shown below each review card.
4. Public profile stats (`statsProjectsCompleted`, `statsRepeatClientPct`, etc.) updated on project completion.
5. Average rating added as a new cached stat (`statsAvgRating`).

**Edge cases:**
- Freelancer has 0 reviews: profile shows "No reviews yet — reviews appear after project completion."
- New review with very low rating (1–2 stars): no suppression — published normally after 24-hour window.

---

## Landing Page — Journey Section

### Concept

A **framer-motion timeline scroll** section added to `pakka-landing`, placed after the existing `HowItWorks` section. It tells the story of one fictional project through both lenses — the freelancer's ClearWork dashboard and the client's portal — as the user scrolls.

### Fictional example

- **Freelancer:** Priya (Priya Creative Co., a 3-person design agency)
- **Client:** Raj (founder of Stitchly, a D2C apparel startup)
- **Project:** Brand identity + e-commerce website design

### Story beats (12 steps — lead discovery to completed client)

| # | Who acts | What happens | Visual |
|---|----------|-------------|--------|
| 0 | Raj | Finds Priya Creative Co. on Instagram; fills her enquiry form — or Priya imports Raj from a lead campaign | Priya's public profile with enquiry badge + DiscoveredLead card appearing in CRM |
| 1 | Priya | Converts the enquiry to a Contact at ENQUIRY stage; notes deal value ₹85k and sets a follow-up date | CRM pipeline view — Raj's card in ENQUIRY column with deal value tag |
| 2 | Priya | Sends a branded proposal: ₹85,000 for brand + website — Contact stage auto-advances to PROPOSAL_SENT | Proposal preview with scope, timeline, pricing |
| 3 | Raj | Opens the proposal link — Priya gets a push notification | Notification badge: "Raj opened your proposal · just now" |
| 4 | Raj | Accepts the proposal — Contact stage moves to CLIENT; Priya is prompted to create a contract | Proposal accepted screen; "Create contract?" one-click prompt |
| 5 | Raj | Signs the contract via OTP — project creation offered immediately | Contract signed screen with OTP confirmation; "Start project?" button |
| 6 | Priya | Creates the project, assigns tasks to team, sets milestones | Kanban board with tasks assigned to Amit, Neha, Priya |
| 7 | Raj | Sees his portal: active tasks, a project update from Priya | Client portal: "Design Phase — 60% complete" |
| 8 | Raj | Raises a change request: "Add Hindi language to the website" | Change request form; Priya responds: +₹8,000 |
| 9 | Raj | Approves the change; a new invoice for ₹8,000 is auto-generated | New invoice auto-generated, Raj pays via UPI |
| 10 | Priya | Uploads final deliverables; requests project sign-off | Sign-off screen; Raj approves with OTP |
| 11 | Raj | Leaves a 5-star review; it appears on Priya's public profile | Review card live on profile: "Delivered on time and beyond expectations" |

### Technical approach

- Section component: `src/components/JourneySection.tsx` in `pakka-landing`
- Scroll driver: `useScroll` + `useTransform` from framer-motion (consistent with Hero.tsx pattern)
- Lenis: already wired in App.tsx — smooth scroll handles the timeline feel
- Timeline axis: centered vertical line (desktop); left-aligned (mobile)
- Each story beat: a card that `useInView` triggers into view with `opacity: 0→1`, `y: 40→0`
- Alternates left/right for freelancer vs client perspective beats
- Mock UI thumbnails: lightweight inline SVG or static screenshot composites (no real screenshots needed)
- Scroll-linked highlight: the vertical timeline line fills with color as the user scrolls through it (CSS `scaleY` driven by `scrollYProgress`)

---

## Navigation & Pipeline UX

The ClearWork sidebar has a structural mismatch: "Lead Capture" and "Pipeline" are two separate nav items even though they are two views of the same entity (contacts in early stages). More confusingly, "Pipeline" currently routes to a **projects** kanban — a naming collision that will puzzle every new user. Meanwhile, the "Projects" page shows a flat card grid when a pipeline-first kanban (matching what leads already get) would be far more useful and consistent.

### FN1 — Unified Leads Tab

**Problem:** Lead Capture (`/lead-capture`) and the leads kanban (embedded in the leads page) are split across two nav items. A freelancer has to navigate to different places to capture and then track the same leads.

**Proposed:** Consolidate into a single **"Leads"** nav item at `/leads` with two internal sub-tabs:

- **Pipeline** (default sub-tab) — the leads/contacts kanban board (ENQUIRY → PROPOSAL_SENT → NEGOTIATING → LOST columns). This is the view a freelancer opens most often — what is my pipeline health right now?
- **Capture** — the current Lead Capture page: enquiry inbox (PublicProfileEnquiry records pending review), discovered leads list, intake form submissions. New-lead indicators (unread badge) should surface on this sub-tab.

**Nav changes required:**
- Remove `lead-capture` nav item
- Remove `pipeline` nav item (currently misnamed — it shows projects)
- Add `leads` nav item → `/leads` (icon: `GitBranch` or `Users2`)
- Default section grouping: `leads` replaces `lead-capture` + `pipeline` in the first section

**Scope boundary:** Does not change the leads/contacts data model. Purely a navigation and page restructure.

---

### FN2 — Projects as Pipeline-First

**Problem:** The `Projects` page at `/projects` shows a flat card grid. The actual projects kanban lives at `/pipeline` — a route name that implies "leads pipeline" to any new user. The two are split where they should be one.

**Proposed:**
1. `/projects` defaults to the **kanban view** (project stages as columns: Scoping → Proposal Sent → Active → On Hold → Completed). This absorbs the logic from `PipelinePage.tsx`.
2. A **"List"** toggle in the top-right switches to the current card grid for users who prefer that density.
3. Clicking any project card in the kanban navigates to `/projects/:id` (existing project detail page — no changes to that page).
4. The `/pipeline` route is **retired** — it redirects to `/projects`. The `pipeline` nav item is removed (already covered by FN1 removal).
5. Stats bar (Total / Ongoing / Budget / Paid / Retainers) from the current Projects header is preserved in the kanban view.

**No backend changes needed.** All kanban logic exists in `PipelinePage.tsx` and project stages exist in the DB. This is a frontend merge: `PipelinePage` inline kanban moves into `ProjectsPage`, the grid view becomes a toggle, `/pipeline` redirects to `/projects`.

---

### FN3 — Customizable Lead Pipeline Stages

**Problem:** The active lead pipeline stages (ENQUIRY, PROPOSAL_SENT, NEGOTIATING) are hardcoded as a Prisma enum. Freelancers from different industries use different vocabulary and have different qualification steps (e.g. a web designer may want "Discovery Call Done" between ENQUIRY and PROPOSAL_SENT).

**Proposed:**
1. A **"Manage Stages"** button appears on the Leads Pipeline view (top-right, next to view-toggle).
2. The panel shows all active pipeline stages in current order with:
   - Drag handle to reorder
   - Color dot picker (6 preset colors)
   - Inline rename (click to edit)
   - Delete button (disabled if stage has active contacts — shows tooltip "Move contacts out first")
   - "Add a new stage" row at the bottom with name input + color picker + Add button
3. Changes are saved per workspace and apply immediately to the kanban columns.
4. **Locked stages** (CLIENT, PAST_CLIENT, LOST) are shown at the bottom of the panel as read-only — labelled "System stage — cannot be renamed or removed" — since automations depend on them.

**Backend impact (significant):**
- The customizable "active pipeline" stages need a `WorkspacePipelineStage` table: `(id, workspaceId, name, color, position, systemKey?)`.
- `systemKey` stores the original enum value for the 3 locked stages; custom stages have null.
- `Contact.stage` can no longer be a raw enum for the customizable portion — it needs to reference the stage's `id` (or keep the enum for terminal stages and add a `customStageId` nullable FK for active-pipeline stages).
- Migration strategy: seed the default stages from current enum values when a workspace first opens the Manage Stages panel.
- **This is the hardest task in this group.** Defer to its own sprint after FN1 + FN2 land.

**Scope boundary:** Stage customization is leads pipeline only. Project stages (`ProjectStage` enum) remain hardcoded.

---

## Scope Boundaries

### In V1
- Lead entry from all four channels (enquiry form, manual, discovered lead, intake form)
- CRM pipeline view by stage (ENQUIRY → PROPOSAL_SENT → NEGOTIATING → CLIENT)
- Automatic Contact stage transitions when a proposal is sent / accepted
- Change request formal approval + auto-invoice
- Client-visible tasks (per-task toggle)
- Project updates feed (freelancer posts, client reads + replies)
- Project sign-off (OTP-verified)
- Post-project review submission and publishing
- Reviews section on public profile
- Team payout recording (cost log per task, not Razorpay disbursement)
- Landing page journey section (12-step Priya + Raj story)

### Deferred to later
- Duplicate detection UX across all entry channels (warn only in V1; merge tooling deferred)
- Per-deliverable approval (V1 is overall sign-off only)
- Dispute resolution / admin review moderation (flagging exists, decision tooling deferred)
- Client account creation (portal remains token-based throughout V1)
- Milestone model (project stages via existing `projectStage` enum is sufficient for V1)
- Razorpay team disbursement (payout is recorded, not processed)
- Review response from client after freelancer reply
- Win/loss analytics dashboard (reason field is captured; reporting deferred)

### Outside this product's identity
- A marketplace where clients find freelancers (public profile is for inbound, not a discovery platform)
- Time-tracking-to-billing for client invoicing (time entries exist for internal cost tracking only)
- Video calls / screen sharing (meetings exist via external links only)

---

## Success Criteria

1. A client completes the full sign-off flow from their portal with zero WhatsApp/email steps.
2. A change request raised by the client results in a paid additional invoice within the same ClearWork session.
3. At least one review appears on the freelancer's public profile after a completed project.
4. The landing page journey section tells a coherent 10-step story that a visitor can follow without reading any other section.

---

## Outstanding Questions

- **OQ1:** Should the project sign-off generate a PDF "completion certificate" (like the contract audit trail PDF)? This would give the freelancer a legal artifact of delivery acceptance.
- **OQ2:** Should change requests be visible on the client portal history even after they are closed/rejected? (Audit trail for client vs. clutter concern.)
- **OQ3:** For team payout recording — should it appear on the project profit/loss report, and is that report visible in the current Reports module?
- **OQ4:** Landing page journey section — should it link to a live demo or a static tour, or just serve as a marketing illustration?
- **OQ5:** Should the "project completion percentage" shown to the client in the portal be manually set by the freelancer, or auto-calculated from `isDone` task completion rate?

---

## Dependencies & Assumptions

- **Schema additions required (F0):** No new models needed for lead entry — `Contact`, `DiscoveredLead`, `PublicProfileEnquiry`, `IntakeFormSubmission` already exist in the schema. The stage-transition triggers (ENQUIRY → PROPOSAL_SENT → CLIENT) are logic changes, not schema changes.
- **Schema additions required (F1–F8):** `ChangeRequest` model, `ProjectUpdate` model, `Review` model, `isDeliverable` flag on `Attachment`, `clientVisible` on `Task`, `payoutAmount` on `Task`, `statsAvgRating` on `User`. Detailed design deferred to planning.
- **CRM pipeline view:** The Contact list view exists — a kanban-style pipeline grouped by stage is an additive view, not a new module.
- **Auto-stage-transition hook:** When a proposal is sent → Contact.stage becomes `PROPOSAL_SENT`. When a proposal is accepted → `CLIENT`. These are backend event hooks on the existing proposal accept flow; no new API surface needed.
- **portalToken generation:** On stage transition to CLIENT, if `portalToken` is null, generate and persist one. Existing pattern from contract flow.
- **Portal additions required:** Project progress tab, Updates tab, Deliverables tab, Sign-off page, Review form — all within the existing token-auth portal flow.
- **Notification hooks:** New trigger events needed for: new enquiry (F0a), change request raised/responded (F4), sign-off requested (F6), review request sent (F7), review published (F7).
- **Existing automation rules** use string-keyed trigger events — new triggers can be added without schema changes.
- **Public profile page** already has the page shell — reviews section is an additive component.
- **Assumption:** Client identity in the portal is always tied to the `Contact` record via `portalToken`. No anonymous reviews.
- **Assumption:** All OTP flows use the existing OTP mechanism from the contract signing flow.
- **Assumption:** The duplicate-detection warning on lead entry (F0a edge cases) is a soft block — the freelancer can dismiss the warning and create anyway.
