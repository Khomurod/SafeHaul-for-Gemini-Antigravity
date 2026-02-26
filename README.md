<p align="center">
  <h1 align="center">🚛 SafeHaul</h1>
  <p align="center">
    <strong>Multi-Tenant Trucking HR & Recruitment Platform</strong>
  </p>
  <p align="center">
    DOT-Compliant Driver Applications · Lead Distribution Engine · Bulk SMS Campaigns · E-Signatures · Real-Time Analytics
  </p>
  <p align="center">
    <a href="https://truckerapp-system.web.app/">Live App</a> ·
    <a href="#architecture">Architecture</a> ·
    <a href="#getting-started">Getting Started</a> ·
    <a href="#deployment">Deployment</a>
  </p>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running Locally](#running-locally)
- [Cloud Functions](#cloud-functions)
- [Firestore Security](#firestore-security)
- [Deployment](#deployment)
- [Testing](#testing)
- [Key Integrations](#key-integrations)
- [License](#license)

---

## Overview

SafeHaul is a **multi-tenant SaaS platform** built for trucking companies to manage the entire driver hiring lifecycle — from lead acquisition and distribution, through DOT-compliant applications, to e-signatures and onboarding. The platform serves three distinct user personas through role-based portals:

| Portal | Users | Purpose |
|--------|-------|---------|
| **Super Admin** (Mission Control) | Platform operators | Lead pool management, company provisioning, analytics, system health |
| **Company Admin / HR** | Recruiters, HR managers | Application review, pipeline tracking, campaigns, team management |
| **Driver App** | CDL drivers | Public application submission, document uploads, e-signing |

---

## Features

### 🧲 Lead Distribution Engine
- **Automated daily distribution** at 7:00 AM CT via scheduled Cloud Functions
- **"Dealer" architecture** — fair round-robin distribution across companies
- **Ghost lead protection** using Firestore Transactions
- **Plan-based quotas** — Free (50/day), Paid (200/day), or custom overrides
- **Supply & demand analytics** with real-time pool health monitoring

### 📋 DOT-Compliant Driver Applications
- **9-step wizard** (Contact → Qualifications → License → Violations → Accidents → Employment → General → Review → Consent)
- **Deterministic application IDs** — `SHA-256(companyId + email + phone)` prevents duplicates
- **Offline-resilient submission** via IndexedDB queue with exponential backoff
- **Guest submissions** through public company links (no auth required)
- **49 CFR 391.21 compliant** PDF generation with full legal agreements

### 📨 Bulk SMS/Email Campaigns
- **Recursive worker pattern** — processes in small batches (20 at a time) to avoid timeouts
- **Zombie worker prevention** — double-check strategy ensures cancelled campaigns stop immediately
- **Multi-provider SMS** — RingCentral + 8x8 integration with per-recruiter number routing
- **Automatic fallback** — if a recruiter's direct line fails, retries with the company main number
- **7-day deduplication** — prevents re-messaging recently contacted leads

### ✍️ E-Signatures & Document Management
- **Draw or type** signatures via canvas or text input
- **Document fan-out** — uploaded files are stored in structured subcollections (`dq_files`)
- **Digital sealing** with tamper-evident envelope system
- **Public signing links** — recipients can sign without creating an account

### 📊 Analytics & Pipeline
- **Real-time dashboard** with daily stats aggregation
- **Hiring pipeline** with customizable stages (In Process, On Hold, Hired, Rejected)
- **Activity logging** on all driver and lead interactions
- **Performance charting** via Recharts

### 🏢 Multi-Tenant Company Management
- **Company provisioning** with slug-based public profiles
- **Team management** — invite recruiters, assign roles, manage permissions
- **Custom application schemas** — companies can add custom questions to the driver wizard
- **Segment-based audience targeting** for campaigns

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19 | UI framework |
| Vite | 7 | Build tool & dev server |
| React Router | 7 | Client-side routing |
| TailwindCSS | 3.4 | Utility-first styling |
| Framer Motion | 12 | Animations & transitions |
| Recharts | 3.6 | Data visualization |
| Lucide React | 0.552 | Icon library |
| jsPDF | 4.0 | Client-side PDF generation |
| ExcelJS | 4.4 | Spreadsheet parsing for bulk imports |
| React Signature Canvas | 1.1 | Signature capture |
| TipTap | 3.17 | Rich text editor |
| React Virtuoso | 4.18 | Virtualized lists |
| Sentry | 10.32 | Error monitoring |

### Backend (Firebase)
| Technology | Version | Purpose |
|-----------|---------|---------|
| Firebase Admin SDK | 13.6 | Server-side Firestore, Auth, Storage |
| Firebase Functions | 7.0 | Serverless Cloud Functions (v1 + v2) |
| Cloud Firestore | — | NoSQL database |
| Firebase Auth | — | Authentication with custom claims (RBAC) |
| Firebase Storage | — | File uploads (CDL, medical cards, etc.) |
| Firebase Hosting | — | Static site hosting |
| App Check | — | Bot mitigation via reCAPTCHA Enterprise |
| Nodemailer | 7.0 | Email delivery |
| Sentry Node | 10.32 | Server-side error tracking |
| Joi | 18.0 | Request validation |
| pdf-lib | 1.17 | Server-side PDF manipulation |

### Testing
| Technology | Purpose |
|-----------|---------|
| Vitest | Unit testing (frontend) |
| Jest | Unit testing (Cloud Functions) |
| Playwright | End-to-end browser testing |
| Testing Library | React component testing |

---

## Architecture

SafeHaul uses three distinct communication patterns:

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│   React Frontend │────▶│  Firestore (SDK)    │     │  Cloud Functions  │
│   (Vite + SPA)   │     │  Real-time Listeners│     │  (v1 + v2)       │
│                  │────▶│  Direct Reads/Writes│     │                  │
│                  │────▶│                     │     │  - Triggers      │
│                  │     └────────────────────┘     │  - Callables     │
│                  │──────────────────────────────▶│  - Scheduled     │
└──────────────────┘                                └──────────────────┘
        │                                                    │
        │              ┌────────────────────┐                │
        └──────────────│  Firebase Storage   │◀──────────────┘
                       │  (Document Uploads) │
                       └────────────────────┘
```

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Real-time Listeners** (`onSnapshot`) | Dashboards, feeds | Lead lists, application status |
| **Direct SDK** (`getDocs`, `setDoc`) | Low-latency CRUD | Templates, search, stats |
| **Cloud Functions** (`httpsCallable`) | Complex logic, 3rd-party APIs | Bulk SMS, lead distribution, auth |
| **Background Triggers** (`onDocumentCreated`) | Automated pipelines | Driver profile sync, stats aggregation |

> For detailed architecture documentation, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Project Structure

```
SafeHaul/
├── src/                          # Frontend source
│   ├── App.jsx                   # Root component & routing
│   ├── main.jsx                  # Entry point
│   ├── index.css                 # Global styles
│   ├── config/                   # App configuration
│   ├── context/                  # React Context (DataContext — auth, roles, company)
│   ├── hooks/                    # Global custom hooks
│   ├── lib/                      # Core libraries
│   │   ├── firebase.js           # Firebase SDK initialization
│   │   ├── applicationId.js      # Deterministic ID generator (SHA-256)
│   │   ├── submissionQueue.js    # IndexedDB offline queue
│   │   └── signature.js          # Signature canvas utilities
│   ├── shared/                   # Shared components & utilities
│   │   ├── components/           # Reusable UI (Stepper, Modals, Layout)
│   │   ├── hooks/                # Shared hooks (useBulkImport, etc.)
│   │   ├── utils/                # Helpers, validation, PDF generation
│   │   └── workers/              # Web Workers (import.worker.js)
│   ├── features/                 # Feature modules (domain-driven)
│   │   ├── analytics/            # Charts & performance dashboards
│   │   ├── applications/         # Application list & management
│   │   ├── auth/                 # Login, registration
│   │   ├── campaigns/            # Bulk SMS/Email campaign builder
│   │   ├── companies/            # Company profiles & settings
│   │   ├── company-admin/        # HR portal (leads, uploads, pipeline)
│   │   ├── driver-app/           # Public driver application wizard
│   │   ├── drivers/              # Driver profiles & management
│   │   ├── mission-control/      # Super admin dashboard
│   │   ├── onboarding/           # New user onboarding flow
│   │   ├── settings/             # User & company settings
│   │   ├── signing/              # E-signature system
│   │   └── super-admin/          # Platform-wide admin tools
│   ├── firestore.rules           # Firestore security rules
│   ├── storage.rules             # Storage security rules
│   └── tests/                    # Frontend tests
├── functions/                    # Firebase Cloud Functions
│   ├── index.js                  # Function exports registry
│   ├── firebaseAdmin.js          # Admin SDK singleton
│   ├── driverSync.js             # Application → Profile trigger
│   ├── guestApplication.js       # Guest submission handler
│   ├── leadDistribution.js       # Scheduled lead dealing
│   ├── leadLogic.js              # Distribution algorithms
│   ├── bulkActions/              # Bulk messaging worker system
│   ├── integrations/             # SMS adapters (RingCentral, 8x8)
│   ├── emailService.js           # Email delivery (Nodemailer)
│   ├── statsAggregator.js        # Daily stats computation
│   ├── companyAdmin.js           # Company management functions
│   ├── hrAdmin.js                # HR admin operations
│   ├── digitalSealing.js         # Document sealing
│   ├── publicSigning.js          # Public e-signature handler
│   └── shared/                   # Shared constants & utilities
├── firebase.json                 # Firebase project config
├── firestore.indexes.json        # Composite index definitions
├── .env                          # Environment variables (frontend)
├── functions/.env                # Environment variables (backend)
├── ARCHITECTURE.md               # Detailed architecture docs
└── package.json                  # Frontend dependencies
```

---

## Getting Started

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20.x |
| npm | 10.x+ |
| Firebase CLI | 15.x+ |
| Git | 2.x+ |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Khomurod/SafeHaul-for-Gemini-Antigravity.git
cd SafeHaul-for-Gemini-Antigravity

# 2. Install frontend dependencies
npm install

# 3. Install Cloud Functions dependencies
cd functions && npm install && cd ..
```

### Environment Variables

#### Frontend (`.env`)

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | reCAPTCHA Enterprise site key (App Check) |
| `VITE_SENTRY_DSN` | Sentry error tracking DSN |
| `VITE_FACEBOOK_APP_ID` | Facebook Lead Ads integration |
| `VITE_SUPER_ADMIN_EMAIL` | Super admin fallback email |

#### Cloud Functions (`functions/.env`)

| Variable | Description |
|----------|-------------|
| `SMS_ENCRYPTION_KEY` | AES key for encrypting SMS provider credentials |
| `SENTRY_DSN` | Sentry DSN for server-side error tracking |

> **Note**: Firebase Cloud Functions also use runtime configuration for service-specific keys. See `firebase functions:config:get` for current values.

### Running Locally

```bash
# Start the Vite development server
npm run dev

# The app will be available at http://localhost:5173
```

For a full Firebase emulator setup:

```bash
# Start Firebase emulators (Firestore, Functions, Auth)
firebase emulators:start
```

---

## Cloud Functions

SafeHaul uses **40+ Cloud Functions** organized by domain. Key function groups:

| Group | Functions | Trigger |
|-------|-----------|---------|
| **Driver Sync** | `onApplicationCreated` | Firestore trigger (v2) |
| **Guest Application** | `submitGuestApplication` | Callable (v1) |
| **Lead Distribution** | `runLeadDistribution`, `distributeDailyLeads` | Scheduled + Callable (v2) |
| **Bulk Actions** | `startBulkSession`, `processBulkBatch` | Callable (v2) |
| **SMS Integration** | `sendDirectSms` | Callable (v2) |
| **Email Service** | `sendCustomEmail` | Callable |
| **Stats** | `aggregateStats`, `rebuildLeadStats` | Trigger + Scheduled |
| **E-Signatures** | `generateSigningRequest`, `processSignedDocument` | Callable + Trigger |
| **Admin** | `setUserRole`, `addTeamMember`, `createCompany` | Callable |

### Deploying Individual Functions

```bash
# Deploy a single function (recommended for limited resources)
firebase deploy --only functions:functionName

# Deploy all functions
firebase deploy --only functions

# Deploy hosting only
firebase deploy --only hosting
```

---

## Firestore Security

Security is enforced through **Role-Based Access Control (RBAC)** using Firebase Custom Claims:

```
Custom Claims Structure:
{
  "globalRole": "super_admin",           // Platform-wide access
  "roles": {
    "companyId_abc": "company_admin",    // Company admin
    "companyId_xyz": "recruiter"         // Recruiter at another company
  }
}
```

| Role | Scope | Permissions |
|------|-------|-------------|
| `super_admin` | Global | Full read/write to all collections |
| `company_admin` | Company | Manage team, settings, templates, applications |
| `hr_user` / `recruiter` | Company | Read/write leads, applications, campaigns |
| `driver` | Self | Own profile, own applications |
| Guest (unauthenticated) | Limited | Submit applications via App Check |

> Security rules are defined in [`src/firestore.rules`](src/firestore.rules).

---

## Deployment

The app is deployed to **Firebase Hosting** at [truckerapp-system.web.app](https://truckerapp-system.web.app/).

```bash
# Full deployment (frontend + functions + rules)
firebase deploy

# Frontend only
npm run build && firebase deploy --only hosting

# Firestore rules only
firebase deploy --only firestore:rules

# Storage rules only
firebase deploy --only storage
```

> **Important**: When deploying Cloud Functions, deploy them **one at a time** if you have limited CPU to avoid OOM issues during build.

---

## Testing

```bash
# Frontend unit tests (Vitest)
npm test

# Cloud Functions tests (Jest)
cd functions && npm test

# End-to-end tests (Playwright)
npx playwright test

# Linting (Frontend + Backend)
npm run lint
```

---

## Key Integrations

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Firebase** | Auth, Database, Storage, Hosting, Functions | `.env` + Firebase Console |
| **RingCentral** | SMS sending (primary) | Encrypted in Firestore (`companies/{id}/integrations/sms_provider`) |
| **8x8** | SMS sending (alternate) | Encrypted in Firestore |
| **Sentry** | Error monitoring (frontend + backend) | `VITE_SENTRY_DSN` / `SENTRY_DSN` |
| **reCAPTCHA Enterprise** | Bot mitigation (App Check) | `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` |
| **Facebook Lead Ads** | Lead ingestion | `VITE_FACEBOOK_APP_ID` |
| **Nodemailer** | Email delivery | Company-specific SMTP settings |

---

## Known Issues & Audit Findings

> **Last Audited:** February 26, 2026
> See also: [`Recommendations.md`](Recommendations.md) for detailed descriptions and fix instructions.

### 🔴 Critical

| # | Issue | Files | Source |
|---|-------|-------|--------|
| AF1 | Employer field names mismatch — form saves `name`/`street`/`reason`, display reads `companyName`/`address`/`reasonForLeaving` | `Step6_Employment.jsx`, `ApplicationTab.jsx` | Recommendations |
| AF2 | CDL expiration badge always shows "--" (`cdlExpiration` vs `cdlExpirationDate`) | `ApplicationTab.jsx` | Recommendations |
| AF3 | SchemaRenderer cannot render array sections (Employment, Addresses, etc.) | `SchemaRenderer.jsx` | Recommendations |
| 1 | Confirmation number format mismatch — client `SAF-YYYY-XXXXX` vs server `SH-XXXXXX` | `applicationId.js`, `guestApplication.js` | Audit |
| 2 | Placeholder email domain not detected — bulk imports use `@system.local` but server checks `@placeholder.com` | `import.worker.js`, `driverSync.js` | Audit |
| 3 | Phone validation rejects valid 11-digit US numbers (with country code) | `validation.js`, `PublicApplyHandler.jsx` | Audit |
| 11 | `serviceAccountKey.json` not in `.gitignore` | `.gitignore` | Audit |
| 12 | SSN printed unmasked in generated PDFs (data exposure risk) | `pdfGenerator.js`, `pdfSections.js` | Audit |
| 18 | Global leads update rule overly permissive — any staff can update any lead | `firestore.rules` | Audit |
| 19 | `confirmDriverInterest` has no authentication check | `leadDistribution.js` | Audit |

### 🟠 High

| # | Issue | Files | Source |
|---|-------|-------|--------|
| AF4 | SchemaRenderer has no file-type rendering — shows `[object Object]` | `SchemaRenderer.jsx` | Recommendations |
| AF5 | ExperienceTimeline only shows 4 of 11 employer fields (DOT compliance gap) | `ExperienceTimeline` | Recommendations |
| AF6 | Guest vs Authenticated application payloads have different structures | `PublicApplyHandler.jsx` | Recommendations |

### 🟡 Medium / Notable

| # | Issue | Files | Source |
|---|-------|-------|--------|
| M1 | Signature image paths not validated in document sealing | `digitalSealing.js` | Recommendations |
| M2 | Document audit trail "checksum" is not a real cryptographic hash | `digitalSealing.js` | Recommendations |
| M4 | Guest-uploaded files inaccessible through normal Firebase SDK | `storage.rules` | Recommendations |
| M6 | Phone number format inconsistency in blacklist (TCPA risk) | `blacklist.js` | Recommendations |
| AF7 | IdentityCard uses wrong address key (`address` vs `street`) | `ApplicationTab.jsx` | Recommendations |
| AF8 | PDF generator uses different employer field names than the form | `pdfSections.js` | Recommendations |
| 4 | Duplicate `httpsCallable` import (dead code) | `PublicApplyHandler.jsx` | Audit |
| 5 | SSN Card missing from Review step & driverSync fan-out | `Step8_Review.jsx`, `driverSync.js` | Audit |
| 6 | MVR/Drug consent missing from Review step & fan-out | `Step8_Review.jsx`, `driverSync.js` | Audit |
| 7 | Custom questions never shown to public applicants | `PublicApplyHandler.jsx` | Audit |
| 8 | Step navigation breaks when custom questions shift indices | `Step8_Review.jsx`, `Stepper.jsx` | Audit |
| 13 | Storage bucket name mismatch between scripts | `check-cdl.js` (both) | Audit |
| 14 | Duplicate debug scripts with hardcoded driver name | `functions/check-cdl.js`, `scripts/check-cdl.js` | Audit |
| 15 | Dead HOS table code (imported but never called) | `pdfSections.js`, `pdfGenerator.js` | Audit |
| 16 | No admin role check on `backfillEmployerFields` function | `backfillEmployerFields.js` | Audit |
| 17 | Upload instructions say "emails required" but system auto-generates placeholders | `CompanyBulkUpload.jsx`, `import.worker.js` | Audit |
| 20 | `activity_logs` collection group security relies on `companyId` field that may not exist | `firestore.rules` | Audit |
| 21 | ARCHITECTURE.md has stale references (v1 vs v2, RingCentral-only, hash inputs) | `ARCHITECTURE.md` | Audit |
| 22 | Duplicate comment block in leadDistribution.js | `leadDistribution.js` | Audit |

### 🔵 Low

| # | Issue | Files | Source |
|---|-------|-------|--------|
| L1 | Mixed Firebase Functions v1 and v2 usage | Multiple | Recommendations |
| L2 | New SMTP connection created for every email send | `emailService.js` | Recommendations |
| L3 | Guest applications don't require App Check verification | `guestApplication.js` | Recommendations |
| L4 | Smart segment rules are hardcoded (not configurable) | `segments.js` | Recommendations |
| L5 | Rate limit records accumulate forever (no TTL) | `rate_limits` collection | Recommendations |
| 9 | CampaignEditor auto-save fires on mount with defaults | `CampaignEditor.jsx` | Audit |
| 10 | Internal fields visible in bulk upload preview table | `BulkUploadLayout.jsx` | Audit |

---

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run lint` and `npm test` to verify
4. Submit a pull request

---

## License

This project is proprietary software. All rights reserved.

---

<p align="center">
  Built with ❤️ for the trucking industry
</p>
