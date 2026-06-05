### Task 1: Prisma Schema & Database Initialization
Based on the Enterprise Schema V1 specification, write a complete `schema.prisma` file reflecting the 25 core tables. 

Ensure you implement:
1. Enums for roles, alert types, severities, delivery statuses, call statuses, subscription plans, and medication logs sources.
2. Proper relational mappings (e.g., `organizations` to `users`/`elderlies`, `elderlies` to `diseases`/`medications`/`calls`/`alerts`).
3. JSON fields for unstructured configurations (`system_settings.setting_value`, `risk_scores.factors`, `audit_logs.old_data/new_data`).
4. Indexes on frequently queried foreign keys, especially fields coupled with `organization_id` or `elderly_id`.

Provide the Prisma schema file along with a standard seed script (`seed.ts`) initializing basic system settings, role permissions, and a default Super Admin account.