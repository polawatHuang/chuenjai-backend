### Task 3: Elderly & Healthcare Management Modules (CRUD & Excel Data Layer)
Develop the backend controllers, services, repositories, and Zod validators for Module 4 (Elderly), Module 5 (Disease), and Module 6 (Medication).

Requirements:
1. Implement REST endpoints following the Swagger spec: GET /elderlies, GET /elderlies/:id, POST /elderlies, PUT /elderlies/:id, DELETE /elderlies/:id.
2. **Crucial**: Inject `req.user.organization_id` into all Prisma queries to enforce tenant boundaries.
3. Write logic for `POST /elderlies/import` parsing an Excel stream into individual elderly entries, gracefully assigning them to the current organization.
4. Build the medication logger logic (`POST /medication-logs`) which records medication compliance (`TAKEN`, `MISSED`, `SKIPPED`).