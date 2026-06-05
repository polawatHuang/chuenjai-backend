### Task 2: Multi-Tenant JWT Auth & RBAC Core
Update the existing login architecture. The system must use the same login page but inspect the User's role and associated `organization_id`.

Implement the following backend files:
1. `src/middlewares/auth.middleware.js`: Validates JWT Access Tokens (15 mins expiry) and manages Refresh Tokens (30 days expiry) stored in the `login_sessions` table.
2. `src/middlewares/rbac.middleware.js`: Decodes user roles and queries `role_permissions` to allow/deny access to specific routes (`can_view`, `can_create`, `can_update`, `can_delete`).
3. `src/controllers/auth.controller.js`: Handles POST /auth/login, POST /auth/refresh, and logs sessions.
4. Ensure every successful login generates an entry in `audit_logs`.