# Developer Standard Operating Procedure (SOP)

This guide explains how to collaborate on the **Synergy IoT Backend** using Feature-Sliced Design with domain isolation.

---

## 📋 Team Structure

| Domain | Developer | Folder | Responsibilities |
|--------|-----------|--------|------------------|
| **Lingkungan** (Environment) | @keyeicheiaren | `/src/features/lingkungan/` | Sensors, predictions, actuators |
| **Keamanan** (Security) | @Egan354 | `/src/features/keamanan/` | Camera detection, alerts |
| **Intrusi** (Intrusion) | @zufar1228 | `/src/features/intrusi/` | Door locks, ARM/DISARM |
| **Core** | @zufar1228 | `/src/` (except features) | Shared infrastructure, MQTT, DB config |

---

## 🚀 Quick Start

### 1. Clone & Setup
```bash
git clone https://github.com/zufar1228/synergy-backend.git
cd synergy-backend
git pull origin main
pnpm install
```

### 2. Create Feature Branch
```bash
git pull origin main
git checkout -b feat/your-feature-name
```

**Branch naming convention:**
- `feat/your-feature` — new feature
- `fix/bug-description` — bug fix
- `refactor/description` — code refactor
- `docs/description` — documentation

### 3. Make Changes in Your Domain
**Only edit files in your assigned domain:**

- **Lingkungan**: `/src/features/lingkungan/`
- **Keamanan**: `/src/features/keamanan/`
- **Intrusi**: `/src/features/intrusi/`

❌ **Never edit core files** without approval:
- `/src/server.ts`
- `/src/mqtt/`
- `/src/db/models/` (except domain models)
- `/src/services/` (except domain services)
- `/src/config/`
- `/src/types/`

### 4. Commit & Push
```bash
git add .
git commit -m "feat(lingkungan): add sensor calibration

- Implement new calibration endpoint
- Add validation for sensor ranges
- Update tests"

git push origin feat/your-feature-name
```

**Commit message format:**
```
type(domain): short description

- Bullet point details
- More details
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### 5. Open Pull Request on GitHub

1. Go to [synergy-backend](https://github.com/zufar1228/synergy-backend) → **Pull Requests**
2. Click **New Pull Request**
3. Base: `main` | Compare: your branch
4. Add description of changes
5. Click **Create Pull Request**

### 6. Wait for Approval
GitHub automatically requires:
- ✅ **Validation**: lint, typecheck, build must pass
- ✅ **CODEOWNERS Review**: the owner of your domain must approve

GitHub enforces this—you cannot merge without approval.

### 7. Merge
Once approved and checks pass, click **Merge Pull Request**

GitHub Actions automatically deploys to Azure VM when main is updated.

---

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── features/
│   │   ├── lingkungan/
│   │   │   ├── models/          # Domain models
│   │   │   ├── services/        # Domain business logic
│   │   │   ├── controllers/     # API handlers
│   │   │   ├── routes/          # API routes
│   │   │   ├── jobs/            # Cron jobs (if any)
│   │   │   └── index.ts         # Barrel export
│   │   ├── keamanan/
│   │   │   ├── models/
│   │   │   ├── services/
│   │   │   ├── controllers/
│   │   │   ├── routes/
│   │   │   └── jobs/
│   │   └── intrusi/
│   │       ├── models/
│   │       ├── services/
│   │       ├── controllers/
│   │       ├── routes/
│   │       └── jobs/
│   ├── db/                      # Database config (shared)
│   ├── mqtt/                    # MQTT client (shared)
│   ├── services/                # Cross-domain services (alerting)
│   ├── utils/                   # Utilities (shared)
│   ├── types/                   # TypeScript types (shared)
│   ├── server.ts                # App entry point
│   └── config/                  # Configuration (shared)
├── device-simulator/            # Device firmware/simulators
├── .github/
│   ├── workflows/
│   │   ├── deploy.yml           # CI/CD
│   │   └── validate.yml         # Validation
│   └── CODEOWNERS               # Access control
└── package.json
```

---

## 📝 Import Rules

### **Within Your Domain** ✅
```typescript
// In /src/features/lingkungan/services/lingkunganService.ts
import { LingkunganLog } from '../models/lingkunganLog';
import { lingkunganController } from '../controllers/lingkunganController';
```

### **Cross-Domain** ❌ (Avoid)
```
If you need to call another domain's service, ask @zufar1228 to add it to
/src/services/alertingService.ts instead (orchestration layer)
```

### **From Core** ✅
```typescript
// In /src/features/lingkungan/services/lingkunganService.ts
import { db } from '../../../db/config';
import { sendAlert } from '../../../services/alertingService';
import { logger } from '../../../utils/logger';
```

---

## ⚠️ Common Issues

### "GitHub says I need approval but I own the domain"
This happens when your PR also touches **core files** you don't own. Examples:
- Modified `/src/types/` → need @zufar1228's approval
- Modified `/src/mqtt/client.ts` → need @zufar1228's approval
- Modified `/src/server.ts` → need @zufar1228's approval

**Solution:** Only edit files in your domain folder.

### "My PR didn't validate (lint/typecheck failed)"
GitHub Actions will show the error. Fix it locally:
```bash
git pull origin main  # Get latest
pnpm run typecheck
pnpm run lint --fix
git add .
git commit -m "fix: resolve lint errors"
git push origin your-branch
```

### "I need to use another domain's code"
Don't import directly. Instead:
1. Ask @zufar1228 to add it to `/src/services/alertingService.ts`
2. Call it from there

This keeps domains truly isolated.

---

## 🔄 CI/CD Pipeline

### On Pull Request
1. GitHub Actions runs `validate` job:
   - `pnpm run typecheck`
   - `pnpm run build`
2. Checks must pass before merge
3. CODEOWNERS review required

### On Push to Main
1. Same validation as PR
2. If validation passes, `deploy` job runs:
   - SSH into Azure VM
   - `git pull origin main`
   - `pnpm install && pnpm run build`
   - `pm2 restart backend-api`
3. Backend is live in ~2 minutes

---

## 🆘 Need Help?

- **TypeScript errors?** Run `pnpm run typecheck` locally
- **Build fails?** Run `pnpm run build` locally
- **Need core changes?** Open issue for @zufar1228
- **Another domain's bug?** Notify the domain owner

---

## ✅ Checklist Before Pushing

- [ ] Changes only in my domain folder (`/src/features/{domain}/`)
- [ ] No changes to core files without approval
- [ ] Ran `pnpm run typecheck` locally (0 errors)
- [ ] Ran `pnpm run build` locally (success)
- [ ] Commit message is descriptive
- [ ] Ready for code review
