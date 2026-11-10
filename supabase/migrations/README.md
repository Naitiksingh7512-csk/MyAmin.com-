# Supabase migration tracking

The live Supabase project has 35 applied migration-history entries as of 2026-11-10.

## Important baseline warning

`001_myamin_core.sql` is a legacy schema draft. It defines a different schema (for example `profiles`, `user_roles`, and older booking columns) and is **not a clean-install baseline for the current live project**.

The live project was evolved through additional dashboard-applied migrations. Several of those applied migration records do not have their original SQL source files in this repository. The database history is authoritative for the live project; this folder is not yet a complete reproducible history for a brand-new Supabase project.

Do not run `supabase db reset` or replay this folder against production/a fresh project until the historical migrations have been recovered and reconciled. Do not fabricate replacement SQL for missing historical migrations.

## Newly tracked migrations

The migrations added on 2026-11-10 are tracked here and have already been applied to the live project:

- `20261110110650_enforce_team_permissions_and_complete_module_access.sql`
- `20261110110739_allow_admin_and_customer_module_address_access.sql`
- `20261110110817_seed_myamin_service_categories.sql`
- `20261110111005_index_ai_message_user_lookup.sql`
- `20261110111210_scope_team_directory_and_commission_permissions.sql`

Future database changes should be created as versioned SQL files in this directory and applied through Supabase migrations, then committed to GitHub.
