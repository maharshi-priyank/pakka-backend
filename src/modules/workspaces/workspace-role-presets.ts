import { Permission } from '@prisma/client'

// KTD-2: seeded as per-workspace WorkspaceRole copies (isSystem: false,
// workspaceId = the new workspace) at workspace creation time — not global
// templates. Owners can freely edit or delete these afterwards.
export const PRESET_ROLES: Array<{ key: string; name: string; description: string; permissions: Permission[] }> = [
  {
    key: 'PRESET_DESIGNER',
    name: 'Designer',
    description: 'Client and project visibility with task management.',
    permissions: [
      'VIEW_CLIENTS', 'VIEW_PROJECTS', 'MANAGE_TASKS', 'VIEW_PROPOSALS',
      'VIEW_INBOX', 'SEND_MESSAGES', 'VIEW_CALENDAR',
    ],
  },
  {
    key: 'PRESET_ACCOUNT_MANAGER',
    name: 'Account Manager',
    description: 'Full client and pipeline management, proposal and invoice visibility.',
    permissions: [
      'VIEW_LEADS', 'MANAGE_LEADS', 'VIEW_CLIENTS', 'MANAGE_CLIENTS',
      'VIEW_PROJECTS', 'VIEW_TASKS', 'VIEW_PROPOSALS', 'MANAGE_PROPOSALS', 'SEND_PROPOSALS',
      'VIEW_CONTRACTS', 'VIEW_INVOICES', 'VIEW_REPORTS',
      'VIEW_INBOX', 'SEND_MESSAGES', 'VIEW_CALENDAR', 'MANAGE_CALENDAR',
    ],
  },
  {
    key: 'PRESET_CONTRACTOR',
    name: 'Contractor',
    description: 'Project and task access for outside collaborators.',
    permissions: [
      'VIEW_PROJECTS', 'VIEW_TASKS', 'MANAGE_TASKS',
      'VIEW_INBOX', 'SEND_MESSAGES', 'VIEW_CALENDAR',
    ],
  },
]
