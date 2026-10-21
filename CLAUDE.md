@AGENTS.md

# Project notes
- Design, rules and milestones: docs/DESIGN.md. Keep its milestone table and "as built" notes current.
- Business rules live in src/lib/rules (pure, unit-tested). Every Server Action re-checks session, membership and role.
- Dates are "YYYY-MM-DD" strings; "today" = todayInIndia(). Money is whole paise (bigint).
- Local DB: Docker container family-pg on port 5434 (not vihan-pg). Secrets in .env.local — never print them.
- Before reporting a milestone: npm test, npm run lint, npm run typecheck, npm run build, browser check.
