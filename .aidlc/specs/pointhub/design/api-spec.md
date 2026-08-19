# API Specification

## Overview
- **Style**: REST (JSON over HTTP)
- **Base URL**: `http://localhost:3000/api`
- **Auth**: Trusted headers from API Gateway (`x-member-id`, `x-system-id`) — not validated by PointHub
- **Content-Type**: `application/json`

## Conventions

- **Pagination**: `?limit=N&offset=M` (default limit=50, offset=0)
- **Error format**: `{ "error": "message", "detail?": "extra info" }`
- **Dates**: ISO 8601 (`YYYY-MM-DD` for dates, full ISO for timestamps)
- **IDs**: String (member IDs like "M1001", transaction IDs like "TXN-001")

---

## Endpoints

### Earn (existing)

#### POST /api/earn
**Source**: US-006, US-011
**Description**: Process a POS sale transaction, calculate and post earn points.

**Request**:
```json
{
  "transactionId": "TXN-001",
  "date": "2026-09-06",
  "time": "14:30",
  "storeId": "S01",
  "memberId": "M1001",
  "tier": "GOLD",
  "lines": [
    { "lineNo": 1, "category": "FRESH", "amountTHB": 250 },
    { "lineNo": 2, "category": "HOME", "amountTHB": 499 }
  ]
}
```

**Response 200** (success or duplicate):
```json
{
  "transactionId": "TXN-001",
  "pointsPosted": 45,
  "totalMilliPoints": 45920,
  "lineResults": [...],
  "duplicate": false
}
```

**Errors**: 400 (missing fields), 500 (internal)

---

### Refund (existing)

#### POST /api/refund
**Source**: US-006, US-011
**Description**: Process a refund, clawback earned points.

**Request**:
```json
{
  "transactionId": "REF-001",
  "originalTransactionId": "TXN-001",
  "date": "2026-09-10",
  "time": "10:00",
  "storeId": "S01",
  "memberId": "M1001",
  "tier": "GOLD",
  "lines": [
    { "lineNo": 1, "category": "FRESH", "amountTHB": -250 }
  ]
}
```

**Response 200**:
```json
{
  "transactionId": "REF-001",
  "originalTransactionId": "TXN-001",
  "pointsClawedBack": 30,
  "isFullRefund": false,
  "duplicate": false
}
```

**Errors**: 400 (missing fields), 404 (original not found), 500 (internal)

---

### Burn (existing)

#### POST /api/burn
**Source**: US-012
**Description**: Redeem points as discount at checkout.

**Request**:
```json
{
  "memberId": "M1001",
  "points": 200,
  "basketTotalTHB": 500,
  "transactionId": "TXN-002"
}
```

**Response 200**:
```json
{
  "memberId": "M1001",
  "pointsBurned": 200,
  "discountTHB": 50,
  "remainingBalance": 183,
  "earnableAmountTHB": 450
}
```

**Errors**: 400 (min 100, multiples of 100, 50% cap, insufficient balance)

---

### Members (existing)

#### GET /api/members/:id
**Source**: US-001
**Response 200**: `{ "memberId": "M1001", "tier": "GOLD", "joinedAt": "2019-03-14" }`
**Errors**: 404 (not found)

#### GET /api/members/:id/balance
**Source**: US-001
**Response 200**: `{ "memberId": "M1001", "balance": 383 }`

#### GET /api/members/:id/history?limit=20&offset=0
**Source**: US-002
**Response 200**:
```json
{
  "memberId": "M1001",
  "entries": [
    {
      "id": 1,
      "entryType": "EARN",
      "points": 45,
      "description": "Earned from transaction TXN-001",
      "transactionId": "TXN-001",
      "createdAt": "2026-09-06T14:30:00Z",
      "txType": "SALE",
      "txDate": "2026-09-06",
      "storeId": "S01",
      "totalAmountTHB": 749,
      "lineDetails": [
        {
          "lineNo": 1,
          "category": "FRESH",
          "amountTHB": 250,
          "winningCampaign": "C1",
          "multiplier": 3,
          "milliPoints": 30000
        }
      ]
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

---

### Campaigns (existing)

#### GET /api/campaigns?active=true
**Source**: US-009
**Response 200**: `{ "campaigns": [...] }`

#### GET /api/campaigns/:id
**Source**: US-009
**Response 200**: Single campaign object

#### POST /api/campaigns
**Source**: US-009
**Request**: `{ "campaignId", "name", "multiplier", "category?", "tier?", "dayOfWeek?", "startDate?", "endDate?", "priority?" }`
**Response 201**: Created campaign
**Errors**: 400 (missing fields), 409 (duplicate ID)

#### PATCH /api/campaigns/:id/activate
**Source**: US-009
**Response 200**: `{ "campaignId": "C1", "isActive": true }`

#### PATCH /api/campaigns/:id/deactivate
**Source**: US-009
**Response 200**: `{ "campaignId": "C1", "isActive": false }`

---

### Adjustments (existing)

#### POST /api/adjustments
**Source**: US-003
**Request**:
```json
{
  "memberId": "M1001",
  "points": 500,
  "reasonCode": "GOODWILL",
  "description": "Compensation for system error on 2026-09-05"
}
```
**Response 201**: `{ "adjustmentId", "memberId", "points", "reasonCode", "newBalance", "createdAt" }`
**Errors**: 400 (missing fields, invalid reason code, zero points), 404 (member not found)

#### GET /api/adjustments?memberId=M1001
**Source**: US-003
**Response 200**: `{ "memberId", "adjustments": [...] }`

---

### Reports (existing)

#### GET /api/reports/liability
**Source**: US-010
**Response 200**:
```json
{
  "totalOutstandingPoints": 2888,
  "byTier": [
    { "tier": "GOLD", "totalPoints": 1028, "memberCount": 3 },
    { "tier": "SILVER", "totalPoints": 862, "memberCount": 3 },
    { "tier": "PLATINUM", "totalPoints": 998, "memberCount": 2 }
  ],
  "expiring": { "next1Month": 0, "next2Months": 0, "next3Months": 0 },
  "generatedAt": "2026-08-19T13:00:00+07:00"
}
```

---

### Admin (NEW)

#### POST /api/admin/run-expiry
**Source**: US-005
**Description**: Triggers point expiry for all eligible earned months.

**Response 200**:
```json
{
  "batchesExpired": 3,
  "totalPointsExpired": 150,
  "executedAt": "2026-08-19T01:00:00+07:00"
}
```

**Errors**: 500 (internal)

---

### Health & Lifecycle (extend existing)

#### GET /api/health
**Existing**. Returns: `{ "status": "ok", "service": "pointhub" }`

#### GET /api/ready (NEW)
**Source**: D3-12
**Description**: Readiness probe — checks DB connection is alive.
**Response 200**: `{ "status": "ready", "db": "connected" }`
**Response 503**: `{ "status": "not_ready", "db": "disconnected" }`

#### GET /api/metrics (NEW)
**Source**: D3-10
**Description**: Basic metrics (request count, latency histogram, active connections).
**Format**: Prometheus text format or JSON (TBD based on library)
