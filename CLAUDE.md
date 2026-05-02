# REZ Student Service - Documentation

**Version:** 1.0.0
**Last Updated:** 2026-05-02

---

## Overview

`rez-student-service` is the central orchestration service for the Student Partnership System. It handles all student-related features including verification, wallet management, gamification, campus partnerships, and student-specific pricing.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Student Service                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│  │   Verification   │    │      Wallet      │    │   Gamification   │     │
│  │    Service      │    │     Service      │    │     Service      │     │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘     │
│           │                       │                       │                  │
│  ┌────────▼─────────┐    ┌────────▼─────────┐    ┌────────▼─────────┐     │
│  │   Verification   │    │      Wallet      │    │     Leaderboard   │     │
│  │     Routes       │    │     Routes       │    │     Routes       │     │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘     │
│           │                       │                       │                  │
│  ┌────────▼─────────┐    ┌────────▼─────────┐    ┌────────▼─────────┐     │
│  │   Partnerships   │    │     Pricing     │    │    Referral      │     │
│  │     Routes       │    │     Routes      │    │    Routes       │     │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────┐
                         │     MongoDB      │
                         │   (rez-student)  │
                         └──────────────────┘
```

---

## Services

### 1. Verification Service

Handles student document verification and identity validation.

**Features:**
- Document upload (ID card, admit card, bonafide, Aadhaar, passport)
- Auto-verification based on email domain
- Manual admin review workflow
- Verification expiry management
- Audit trail

**Models:**
- `StudentVerification`
- `Institution`

### 2. Wallet Service

Manages student-specific wallet with parental controls.

**Features:**
- Student cash balance
- Parent funding requests with approval workflow
- Monthly spending tracking
- Budget alerts
- Parental spending limits

**Models:**
- `StudentWallet`
- `FundingRequest`
- `StudentBudget`

### 3. Gamification Service

Student tier system, missions, and leaderboards.

**Features:**
- 5-tier system: Freshman → Sophomore → Junior → Senior → Scholar
- Coin multipliers per tier (1.5x - 3.0x)
- Student missions with rewards
- Campus and institution leaderboards
- Achievements and badges

**Models:**
- `StudentProfile`
- `StudentMission`
- `StudentLeaderboard`

### 4. Campus Partnership Service

Manages merchant-student partnerships.

**Features:**
- Create partnerships with multiple institutions
- Offer types: Percentage, Fixed, BOGO, Free Delivery
- Daily redemption limits
- Student verification requirements
- Analytics and reporting

**Models:**
- `CampusPartner`

### 5. Pricing Service

Student-specific pricing calculations.

**Features:**
- Student discount calculation
- Minimum price floors
- Campus-exclusive pricing
- Cart-level discounts
- Budget-friendly product discovery

---

## API Endpoints

### Verification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/student/verify` | Submit verification |
| GET | `/api/student/verification-status` | Check status |
| GET | `/api/student/institutions` | Search institutions |
| GET | `/api/admin/student-verifications` | Admin: pending list |
| POST | `/api/admin/student-verifications/:id/approve` | Admin: approve |
| POST | `/api/admin/student-verifications/:id/reject` | Admin: reject |

### Wallet

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/student/wallet` | Get wallet info |
| POST | `/api/student/wallet/request-funding` | Request parent funds |
| POST | `/api/student/wallet/approve-funding` | Parent: approve |
| POST | `/api/student/wallet/link-parent` | Link parent account |
| GET | `/api/student/budget` | Get budget summary |
| POST | `/api/student/budget` | Set budget |

### Gamification

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/student/profile` | Get profile + tier |
| GET | `/api/student/missions` | Get available missions |
| POST | `/api/student/missions/:id/claim` | Claim reward |
| GET | `/api/student/leaderboard/:institutionId` | Campus rankings |
| GET | `/api/student/rank/:institutionId` | User's rank |

### Campus Partnerships

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/student/partnerships` | Create partnership |
| GET | `/api/student/partnerships` | List partnerships |
| GET | `/api/student/offers/:institutionId` | Student offers |
| GET | `/api/student/popular/:institutionId` | Popular partners |
| POST | `/api/student/redeem` | Redeem offer |

### Pricing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/student/price` | Calculate price |
| GET | `/api/student/affordable` | Budget options |
| POST | `/api/student/cart-discount` | Cart discount |

### Referrals

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/student/referral/apply` | Apply code |

---

## Student Tiers

| Tier | Min Coins | Multiplier | Badge | Perks |
|------|-----------|------------|-------|-------|
| Freshman | 0 | 1.5x | FRESHMEN | 5% extra coins, Basic offers |
| Sophomore | 500 | 1.75x | SOPHOMORE | 7% extra, Priority offers |
| Junior | 1500 | 2.0x | JUNIOR | 10% extra, Early access |
| Senior | 3000 | 2.5x | SENIOR | 15% extra, VIP support |
| Scholar | 5000 | 3.0x | SCHOLAR | 20% extra, Concierge |

---

## Student Missions

| ID | Title | Coins | Target |
|----|-------|-------|--------|
| first_student_order | First Bite | 100 | 1 order |
| refer_5_classmates | Study Group Builder | 500 | 5 referrals |
| campus_explorer | Campus Explorer | 200 | 3 merchants |
| exam_week_survivor | Exam Week Survivor | 300 | 5 orders |
| graduation_gold | Golden Graduate | 1000 | Reach Scholar |
| early_bird | Early Bird | 50 | 10 early orders |
| social_shopper | Social Shopper | 150 | 5 shares |

---

## Deployment

### Render Blueprint

```yaml
# render.yaml
services:
  - type: web
    name: rez-student-service
    env: node
    region: singapore
    buildCommand: npm install && npm run build
    startCommand: npm start
    healthCheckPath: /health
    envVars:
      - key: MONGODB_URI
        sync: false
      - key: PORT
        value: 4025
```

### Environment Variables

See `.env.example` for all required variables.

---

## Testing

```bash
# Start service
npm run dev

# Health check
curl http://localhost:4025/health

# Submit verification
curl -X POST http://localhost:4025/api/student/verify \
  -F "userId=<user_id>" \
  -F "institutionId=<institution_id>" \
  -F "studentIdNumber=ABC123" \
  -F "documentType=id_card" \
  -F "document=@path/to/document.jpg"

# Get student offers
curl "http://localhost:4025/api/student/offers/<institution_id>"
```

---

## Integration Points

| Service | Purpose | Integration Method |
|---------|---------|-------------------|
| `rez-wallet-service` | Fund transfers | HTTP API |
| `rez-gamification-service` | Sync coins | HTTP API |
| `rez-catalog-service` | Product pricing | HTTP API |
| `rez-notification-service` | Push notifications | HTTP API |

---

## Metrics

```
GET /metrics
```

Returns:
- `verifications` - Total verification submissions
- `verifiedStudents` - Successfully verified count
- `institutions` - Registered institutions
- `wallets` - Active student wallets
- `profiles` - Student profiles created

---

**Maintained by:** REZ Team
**Repository:** imrejaul007/rez-student-service
