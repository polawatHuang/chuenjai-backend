### Task 6: Next.js 16 Admin Dashboard & Portal Components
Build the frontend presentation layer matching the custom mockups needed for Municipalities and Hospitals.

Create the components inside `src/app/(dashboard)/`:
1. `executive/page.tsx`: Displays KPIs including total tracked elderlies, live interactive GIS Map rendering coordinates (`latitude`, `longitude`), and an AI Executive Summary box component.
2. `operations/page.tsx`: A real-time monitoring feed displaying "Open Alerts" by severity, active phone calls, and open cases. Utilize Shadcn UI components (Tables, Badges, Alert Dialogs).
3. Integrate data fetching using secure Server-Side or Client-Side patterns with appropriate Bearer Tokens. Ensure access is restricted gracefully based on client-side RBAC session flags.