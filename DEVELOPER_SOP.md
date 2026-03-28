# Synergy IoT — Backend Developer SOP

## Architecture: Modular Monolith (Feature-Sliced Design)

```
src/
├── server.ts                    # Entry point (CORE — do not modify without approval)
├── api/                         # Core API layer (middlewares, core routes/controllers)
├── db/                          # Core database (connection, shared models, associations)
├── config/                      # Core config (Supabase admin)
├── mqtt/                        # MQTT client (orchestrates messages to features)
├── services/                    # Core shared services (alerting, telegram, users, etc.)
├── jobs/                        # Core cron jobs (heartbeat checker)
├── emails/                      # Email templates
├── utils/                       # Shared utilities (apiError, time)
├── types/                       # Shared TypeScript types
└── features/                    # DOMAIN FEATURE SLICES
    ├── lingkungan/              # Environment monitoring (Dev: @org/lingkungan-dev)
    │   ├── models/              #   lingkunganLog, predictionResult
    │   ├── services/            #   lingkunganService
    │   ├── controllers/         #   lingkunganController
    │   ├── routes/              #   lingkunganRoutes
    │   └── index.ts             #   Barrel export
    ├── keamanan/                # Security detection (Dev: @org/keamanan-dev)
    │   ├── models/              #   keamananLog
    │   ├── services/            #   keamananService, repeatDetectionService
    │   ├── controllers/         #   keamananController
    │   ├── routes/              #   keamananRoutes
    │   ├── jobs/                #   repeatDetectionJob
    │   └── index.ts
    └── intrusi/                 # Intrusion detection (Dev: @org/intrusi-dev)
        ├── models/              #   intrusiLog
        ├── services/            #   intrusiService, actuationService
        ├── controllers/         #   intrusiController
        ├── routes/              #   intrusiRoutes
        ├── jobs/                #   disarmReminderJob
        └── index.ts
```

## Rules for Domain Developers

### 1. Stay in Your Feature Directory

- **Lingkungan dev** works ONLY in `src/features/lingkungan/`
- **Keamanan dev** works ONLY in `src/features/keamanan/`
- **Intrusi dev** works ONLY in `src/features/intrusi/`

### 2. Import Rules

```
✅ Feature → Core:     import { Device } from '../../../db/models';
✅ Feature → Feature:   import within your OWN feature (relative paths)
❌ Feature → Feature:   NEVER import from another feature's directory
❌ Feature → Core edit: NEVER modify core files without core-team approval
```

### 3. Adding New Functionality

If your feature needs new logic:

1. Add models in `src/features/<your-feature>/models/`
2. Add services in `src/features/<your-feature>/services/`
3. Add controllers in `src/features/<your-feature>/controllers/`
4. Add routes in `src/features/<your-feature>/routes/`
5. Add jobs in `src/features/<your-feature>/jobs/`
6. Export from `src/features/<your-feature>/index.ts`

If you need a **core change** (e.g., new field on Device model, new MQTT topic), open a PR and tag `@org/core-team`.

## Git Workflow (MANDATORY)

### Before Starting Work

```bash
git checkout main
git pull origin main
git checkout -b feature/<your-domain>/<description>
# Example: feature/lingkungan/add-co2-threshold-alert
```

### While Working

```bash
# Stage ONLY your feature files
git add src/features/<your-domain>/

# Commit with conventional format
git commit -m "feat(lingkungan): add CO2 threshold alert"
```

### Before Pushing

```bash
# ALWAYS pull latest main and rebase BEFORE pushing
git fetch origin main
git rebase origin/main

# Fix any conflicts, then:
git push origin feature/<your-domain>/<description>
```

### Create a Pull Request

1. Open a PR targeting `main`
2. CI will automatically run **typecheck + build** — both MUST pass
3. CODEOWNERS will auto-assign the correct reviewer
4. If your PR touches files outside your feature directory, the core-team will be notified

### Commit Message Convention

```
feat(<domain>): short description     # New feature
fix(<domain>): short description      # Bug fix
refactor(<domain>): short description # Code restructuring
```

## CI/CD Pipeline

| Trigger        | Validation                   | Deploy                           |
| -------------- | ---------------------------- | -------------------------------- |
| Push to `main` | TypeScript typecheck + Build | SSH → DigitalOcean → pm2 restart |
| PR to `main`   | TypeScript typecheck + Build | None (validation only)           |

**Failing typecheck or build will BLOCK the merge/deploy.**

## Running Locally

```bash
pnpm install
pnpm run dev          # Start dev server with ts-node-dev
pnpm run typecheck    # TypeScript validation (run before pushing!)
pnpm run build        # Full production build
```
