# Family Expenses

Track a family's daily expenses, view any month, search between dates and keep to a monthly budget.
Requirements, rules, database and milestones: [`docs/DESIGN.md`](docs/DESIGN.md).

Stack: Next.js 16 (TypeScript, App Router) · PostgreSQL (Drizzle ORM) · Tailwind CSS · Vitest.

## First-time setup (Windows, PowerShell)

1. Node.js 22+ and Docker Desktop installed.
2. `npm install`
3. Copy `.env.example` to `.env.local` and set a password and session secret
   (random value: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
4. Create the local database container (uses the password from `.env.local`; port 5434 so it doesn't clash with other
   projects' PostgreSQL on 5432):

   ```powershell
   docker run -d --name family-pg --restart unless-stopped `
     -e POSTGRES_USER=family_app -e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=family `
     -p 5434:5432 -v family-pg-data:/var/lib/postgresql/data postgres:17-alpine
   docker exec family-pg psql -U family_app -d family -c "CREATE DATABASE family_test;"
   ```

5. `npm run db:migrate` (once tables exist, from M1).

## Daily use

```powershell
& "C:\Users\Veera\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"   # family-pg starts with Docker
npm run dev                                                                  # http://localhost:3000
```

Health check: http://localhost:3000/api/health → `{"status":"ok","database":"ok"}`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build / run it |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript check |
| `npm run db:generate` | Create a SQL migration from changes in `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Browse the database in the browser (Drizzle Studio) |
