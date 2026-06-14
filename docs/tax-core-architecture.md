# Tax Core Architecture

Midday remains team-centric. For tax/intermediary workflows, `teams` and
`users` are the platform clients; `customers` stays the CRM/invoicing customer
table inside a client workspace.

## Core Rules

- `teamId` remains the tenant boundary for transactions, documents, invoices,
  reports, Vault and settings.
- `customers` must not be used as the intermediary client table.
- Tax client identity, subjects, mandates, tasks, returns and audit records live
  in dedicated tax/admin tables.
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

## Implemented Scope

Implemented foundation:

- `teams.workspace_type`
- `platform_staff`
- `tax_audit_events`
- `adminProcedure`
- `admin.me` and `admin.clients`
- `/admin` client-team list
- onboarding workspace type selection
- `tax_clients`
- `tax_subjects`
- `tax_client_subjects`
- `tax_service_products`
- `tax_entitlements`
- `tax_service_orders`
- `tax_mandates`
- `tax_tasks`
- admin activation for tax clients and manual service entitlements
- automatic mandate/task creation from service `required_mandates`

Future phases should add VAT return snapshots, Digipoort queues, income tax
partner dossiers and customer-facing task completion screens.

## Tax Client Core

Tax clients sit above teams:

- one `tax_clients` row per team in the first implementation
- one or more `tax_subjects` linked through `tax_client_subjects`
- service access through `tax_entitlements`
- future customer purchases through `tax_service_orders`
- Digipoort/SBR authorizations through `tax_mandates`
- execution and activation-code work through `tax_tasks`

Admin can activate a team as:

- private person
- household
- sole proprietor
- company

For now activation creates a primary subject placeholder from team data. Later
intake screens should replace or enrich that subject with verified personal,
partner, RSIN/BSN/KVK and VAT details.

## Service Access And Mandates

Services can be enabled by admin action, a subscription entitlement or a later
service order. All paths should converge on `tax_entitlements`.

When a service is activated, its `tax_service_products.required_mandates` values
create or reuse `tax_mandates` for the primary/business subject:

- `vat_return` requests `BTW`
- `income_tax_private` requests `VIA`, `SBA` and `IB`
- `income_tax_entrepreneur` requests `VIA`, `SBA` and `IB`
- `via_retrieval` requests `VIA`
- `sba_monitoring` requests `SBA`

Each requested mandate creates an open `tax_tasks` row for the activation-code
or authorization step. This lets Midday request authorizations before a customer
orders a specific return, while still supporting orders and subscriptions later.

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
