# Tax Core Architecture

Midday remains team-centric. For tax/intermediary workflows, `teams` and
`users` are the platform clients; `customers` stays the CRM/invoicing customer
table inside a client workspace.

## Core Rules

- `teamId` remains the tenant boundary for transactions, documents, invoices,
  reports, Vault and settings.
- `customers` must not be used as the intermediary client table.
- Tax client identity, subjects, mandates, returns and audit records live in
  dedicated tax/admin tables.
- Existing business workspaces must keep working without a tax entitlement.
- Admin/backoffice access is separate from customer workspace membership.

## Workspace Type

`teams.workspace_type` gives the workspace a product context:

- `business`: default for existing and new business users.
- `personal`: income-tax-only personal workspace.
- `household`: shared workspace for income tax with partner/household flows.

This is not fiscal truth. Fiscal truth belongs in tax tables such as
`tax_subjects`, `tax_relationships` and future return dossiers.

## Admin Procedure

Customer procedures continue to use `protectedProcedure`, which resolves the
active `teamId` and validates `users_on_team` membership.

Backoffice procedures use `adminProcedure`:

- requires a normal authenticated session
- requires `platform_staff.active = true`
- does not use the active customer `teamId` as its global scope
- can later enforce role-specific permissions for reviewer, submitter, support,
  billing and auditor workflows

Internal worker calls should continue to use `internalProcedure`.

## Phase 1 Scope

Implemented foundation:

- `teams.workspace_type`
- `platform_staff`
- `tax_audit_events`
- `adminProcedure`
- `admin.me` and `admin.clients`
- `/admin` client-team list
- onboarding workspace type selection

Future phases should add tax clients/subjects, entitlements, mandates, tax
tasks, VAT return snapshots, Digipoort queues and income tax partner dossiers.

## Compatibility Checks

Every phase should keep these existing flows working:

- business onboarding
- `/transactions` and transaction categories
- `/reports`
- `/vault` upload/download
- `/invoices`
- `/customers`
- billing/settings without tax entitlements
- worker boot and existing queues
