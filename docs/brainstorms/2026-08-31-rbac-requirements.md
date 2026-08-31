# RBAC — Configurable Role & Access System
**Date:** 2026-08-31  
**Status:** Approved for planning  
**Scope:** Studio plan — team member management with configurable permissions

---

## Problem Statement

Studio plan unlocks unlimited team members, but the current system only distinguishes OWNER from MEMBER. A freelancer running a design studio might have a Designer, an Account Manager, and a part-time Contractor in the same workspace — each needing a different view of the business. Without per-role access control, either everyone sees everything (a billing and privacy risk) or owners can't safely add collaborators.

The server-side enforcement gap makes this urgent: the `WorkspacePermissionGuard` and `@RequirePermission()` decorator are built and wired but **not applied to any controller endpoint**. The frontend `Can` component gates UI, but any team member can hit the API directly and bypass it.

---

## Goals

1. Close the server-side enforcement gap — all resource-mutating endpoints must be guarded.
2. Ship pre-defined roles (system + presets) that cover the most common agency team shapes out of the box.
3. Let workspace owners create and edit custom roles via a grouped capability toggle UI.
4. Update the invite flow to assign a role at the point of invite.
5. Clean up the legacy `LegacyMemberRole` / `ownerId` dual-ownership remnants.

---

## Decisions Made

| Decision | Outcome |
|---|---|
| System roles (locked globally) | OWNER / ADMIN / MEMBER / VIEWER — seeded, `isSystem: true`, never editable |
| Agency presets (editable per workspace) | Designer, Account Manager, Contractor — seeded on workspace creation, `isSystem: false` |
| Permission UI | Grouped capability toggles (~7 sections), not a raw 31-item checkbox list |
| System role mutability | OWNER / ADMIN / MEMBER / VIEWER cannot be edited or deleted by anyone |
| Invite flow | Email-only (existing mechanism); role picker shown at invite creation time |
| Preset storage | Per-workspace copies created at workspace-creation time (no new schema columns needed) |

---

## Out of Scope

- Workspace join links (shareable invite URLs) — email-only for now
- Per-resource row-level permissions (e.g. "can only see projects assigned to them")
- Per-workspace editing of the 4 system roles
- Multiple workspaces per account (single-workspace model for now)

---

## Role System Design

### System Roles (global, locked)

Seeded once via migration. `isSystem: true`. No workspace can modify these.

| Role | Key | Default permissions |
|---|---|---|
| Owner | `OWNER` | All 31 |
| Admin | `ADMIN` | All except `MANAGE_BILLING` (30) |
| Member | `MEMBER` | Operational set — see §Permission Groups |
| Viewer | `VIEWER` | View-only set — see §Permission Groups |

### Preset Roles (per-workspace starting points, editable)

Seeded into each new workspace at creation time. `isSystem: false`. An owner can rename, edit permissions, or delete these. They are not global templates — each workspace gets its own mutable copy.

| Preset | Key | Default permissions (starting point) |
|---|---|---|
| Designer | `PRESET_DESIGNER` | VIEW_CLIENTS, VIEW_PROJECTS, MANAGE_TASKS, VIEW_PROPOSALS, VIEW_INBOX, SEND_MESSAGES, VIEW_CALENDAR |
| Account Manager | `PRESET_ACCOUNT_MANAGER` | VIEW_LEADS, MANAGE_LEADS, VIEW_CLIENTS, MANAGE_CLIENTS, VIEW_PROJECTS, VIEW_TASKS, VIEW_PROPOSALS, MANAGE_PROPOSALS, SEND_PROPOSALS, VIEW_CONTRACTS, VIEW_INVOICES, VIEW_REPORTS, VIEW_INBOX, SEND_MESSAGES, VIEW_CALENDAR, MANAGE_CALENDAR |
| Contractor | `PRESET_CONTRACTOR` | VIEW_PROJECTS, VIEW_TASKS, MANAGE_TASKS, VIEW_INBOX, SEND_MESSAGES, VIEW_CALENDAR |

These presets are only seeded for Studio plan workspaces. Free/Solo workspaces have no team members and no presets.

### Custom Roles

Owners can create roles from blank or by copying an existing role. A custom role:
- Has a name and optional description
- Has `isSystem: false`
- Gets permission sets from the grouped toggle UI (see below)
- Can be deleted only if no member is currently assigned to it (frontend should surface a re-assignment step)

---

## Permission Groups

The 31 `Permission` enum values are grouped into 7 sections in the UI. Each section has View and Manage sub-toggles where both exist.

| # | Group | Permissions |
|---|---|---|
| 1 | **Leads & Pipeline** | VIEW_LEADS, MANAGE_LEADS |
| 2 | **Clients & Contacts** | VIEW_CLIENTS, MANAGE_CLIENTS |
| 3 | **Projects & Tasks** | VIEW_PROJECTS, MANAGE_PROJECTS, VIEW_TASKS, MANAGE_TASKS |
| 4 | **Finance & Documents** | VIEW_PROPOSALS, MANAGE_PROPOSALS, SEND_PROPOSALS, VIEW_CONTRACTS, MANAGE_CONTRACTS, SEND_CONTRACTS, VIEW_INVOICES, MANAGE_INVOICES, SEND_INVOICES, RECORD_PAYMENTS |
| 5 | **Communications & Calendar** | VIEW_INBOX, SEND_MESSAGES, VIEW_CALENDAR, MANAGE_CALENDAR |
| 6 | **Forms & Automation** | VIEW_FORMS, MANAGE_FORMS, VIEW_AUTOMATIONS, MANAGE_AUTOMATIONS, VIEW_REPORTS |
| 7 | **Workspace Admin** | MANAGE_WORKSPACE_SETTINGS, MANAGE_BILLING, MANAGE_MEMBERS, MANAGE_INTEGRATIONS |

**Toggle behaviour:**
- Manage implies View — turning on a Manage toggle automatically enables the corresponding View.
- Turning off View turns off Manage too.
- Workspace Admin section is hidden from Viewer/Designer/Contractor preset defaults (not disabled — just collapsed with a lock hint that they're admin-level).

**System role permission reference:**

| Permission | OWNER | ADMIN | MEMBER | VIEWER |
|---|:---:|:---:|:---:|:---:|
| VIEW_LEADS / MANAGE_LEADS | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_CLIENTS / MANAGE_CLIENTS | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_PROJECTS / MANAGE_PROJECTS | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_TASKS / MANAGE_TASKS | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_INBOX / SEND_MESSAGES | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_PROPOSALS / MANAGE_PROPOSALS / SEND | ✓/✓/✓ | ✓/✓/✓ | ✓/✓/✓ | ✓/–/– |
| VIEW_CONTRACTS / MANAGE_CONTRACTS / SEND | ✓/✓/✓ | ✓/✓/✓ | ✓/✓/✓ | ✓/–/– |
| VIEW_INVOICES / MANAGE_INVOICES / SEND / RECORD | ✓/✓/✓/✓ | ✓/✓/✓/✓ | ✓/✓/✓/✓ | ✓/–/–/– |
| VIEW_REPORTS | ✓ | ✓ | ✓ | ✓ |
| VIEW_CALENDAR / MANAGE_CALENDAR | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_FORMS / MANAGE_FORMS | ✓/✓ | ✓/✓ | ✓/✓ | ✓/– |
| VIEW_AUTOMATIONS / MANAGE_AUTOMATIONS | ✓/✓ | ✓/✓ | –/– | –/– |
| MANAGE_WORKSPACE_SETTINGS | ✓ | ✓ | – | – |
| MANAGE_BILLING | ✓ | – | – | – |
| MANAGE_MEMBERS | ✓ | ✓ | – | – |
| MANAGE_INTEGRATIONS | ✓ | ✓ | – | – |

---

## Feature Surfaces

### 1. Roles Settings Page (`/settings/roles`)

**Accessible to:** OWNER, ADMIN (if they have `MANAGE_MEMBERS`)

**Layout:**
- Left column: list of all roles (system roles shown with a lock icon, presets and custom roles show edit/delete actions)
- Right panel: role detail — name, description, member count, permission group toggles
- "New Role" button: opens a blank role editor (or a copy-from-existing picker)
- Editing a system role shows all toggles as read-only with a tooltip explaining they're locked

**Delete guard:** Attempting to delete a role that has members assigned shows a modal requiring re-assignment of those members before deletion can proceed.

### 2. Invite Flow Update (`/settings/team` → Invite modal)

Current: `role` dropdown shows `MEMBER` / `ADMIN` (LegacyMemberRole values).

After: role dropdown shows all workspace roles in sortOrder — system roles first, then presets, then custom. Defaults to MEMBER. Role description is shown as helper text below the selector.

### 3. Member Role Change

Team member row in `/settings/team` shows their current role. Owner / Admin can change via inline dropdown. Change is immediate with an optimistic update + toast.

### 4. Nav & UI Permission Gating

No new work required — `Can` component and nav-item permission gating are already live. Once server-side enforcement is in place, the frontend already shows and hides the right items.

---

## Backend Implementation Notes

### Server-side enforcement (highest priority)

Every resource-mutating endpoint needs `@RequirePermission('PERMISSION_KEY')` applied. The decorator and guard already exist; it's a mechanical application pass across all controllers.

Controllers to audit (non-exhaustive):
- `LeadsController` → `MANAGE_LEADS`
- `ClientsController` → `MANAGE_CLIENTS`
- `ProjectsController` → `MANAGE_PROJECTS`
- `ProposalsController` → `MANAGE_PROPOSALS`, `SEND_PROPOSALS`
- `ContractsController` → `MANAGE_CONTRACTS`, `SEND_CONTRACTS`
- `InvoicesController` → `MANAGE_INVOICES`, `SEND_INVOICES`, `RECORD_PAYMENTS`
- `WorkspacesController` (settings) → `MANAGE_WORKSPACE_SETTINGS`
- `BillingController` → `MANAGE_BILLING`
- `MembersController` → `MANAGE_MEMBERS`

Read-only GET endpoints use `VIEW_*` permissions. Endpoints used by the workspace owner's own session (no team context) may use the `workspaceId === userId` owner shortcut to avoid false positives during the transition.

**Guard verification needed:** `WorkspacePermissionGuard` reads `user.activeWorkspaceId` from the JWT context. For team members, confirm this is correctly populated by the auth middleware for all non-owner sessions. If not, the guard will silently fail.

### Preset role seeding

When a new workspace is created (`WorkspacesService.create`), after the workspace row is inserted, seed the three preset roles (`PRESET_DESIGNER`, `PRESET_ACCOUNT_MANAGER`, `PRESET_CONTRACTOR`) as `WorkspaceRole` rows with `isSystem: false` linked to that workspace.

This requires a `workspaceId` FK on `WorkspaceRole` — currently the model doesn't have one (system roles are global). Two options:

**Option A:** Add `workspaceId String?` to `WorkspaceRole`. System roles have `workspaceId: null`; workspace-scoped roles have the workspace id. This is the cleaner model.

**Option B:** Scope custom roles by a naming convention or by including `workspaceId` as a prefix in the key. Messier — prefer Option A.

Planning must decide and run the migration. The seeding code in workspace creation is straightforward once the FK exists.

### Legacy field cleanup

- `WorkspaceMember.role: LegacyMemberRole` — stop writing this at invite-accept. Read paths still consuming it need to be migrated to `workspaceRole`.
- `User.ownerId` — still written at `acceptInvite` and `removeMember`. Audit all callers (search: `ownerId`) and verify nothing depends on it for auth, entitlements, or billing before removing the writes.
- `isBillingManager()` in `entitlements.service.ts` checks `user.ownerId` — this check needs updating to use the workspace role's `MANAGE_BILLING` permission.

---

## Success Criteria

- [ ] No team member can reach a resource they lack permission for via the API, regardless of what the frontend shows.
- [ ] An owner can create a "Contractor" role with view-only access and invite a user to it; that user sees a limited sidebar and gets 403 on mutation endpoints.
- [ ] System roles (OWNER/ADMIN/MEMBER/VIEWER) cannot be edited or deleted by anyone.
- [ ] Preset roles (Designer/Account Manager/Contractor) exist in every new Studio workspace and can be edited by the owner.
- [ ] The invite flow allows selecting any workspace role, defaulting to MEMBER.
- [ ] `LegacyMemberRole` writes are retired; `User.ownerId` writes are removed.

---

## Open Questions for Planning

1. **`WorkspaceRole.workspaceId` migration:** Confirm schema change (Option A above) and write the migration. System roles get `workspaceId: null`; existing custom roles (if any) need assignment.
2. **Guard activeWorkspaceId path:** Audit how `user.activeWorkspaceId` is set for team members in the JWT middleware; if it's not set, the guard silently passes everything — fix this before rolling out decorator enforcement.
3. **Preset seeding timing:** Should presets be seeded immediately on workspace creation, or lazily on first Studio plan activation? (Recommendation: on workspace creation with a plan check — seed only when `plan === 'STUDIO'`; add them when the owner upgrades to Studio if the workspace already exists.)
