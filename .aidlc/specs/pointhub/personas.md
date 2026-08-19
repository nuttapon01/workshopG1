# Personas

## Summary
- **User Types**: 1 persona (CS agent — the only UI user)
- **Key Roles**: Khun Nee (Customer Service Agent)
- **Design Implications**: Simple single-page lookup UI; member ID input; fast load; no training needed

## Overview
The customer-service screen serves one user type: the CS agent who resolves point disputes.

---

## Khun Nee — Customer Service Agent

**Role**: Customer Service Agent at Siam MegaMart call center

**Goals**:
- Look up a member's point balance and tier instantly by member ID
- See the full transaction history with clear explanation of **why** each entry happened (which campaign, which rule)
- Make manual adjustments (add/deduct) with a reason code when a dispute is justified
- Resolve a point dispute in one call without escalating to IT

**Pain Points**:
- Currently must phone IT to check a member's balance — takes 10–30 minutes per case
- Cannot see which campaign produced which points — makes disputes impossible to explain to customers
- No way to self-service an adjustment — every correction requires an IT ticket
- Handles 15–20 point dispute cases per day; any friction multiplies

**User Journey**: Customer calls with dispute → Agent enters member ID → Sees balance + tier + history with campaign attribution → Identifies the issue → Makes adjustment if needed → Done in 2 minutes

**Implications**:
- UI must be a single page (no navigation, no login complexity)
- Member ID is the only lookup — no search by name/phone (member DB has no search)
- History must show the "why": campaign name or rule that produced each entry
- Adjustment form needs reason code dropdown (GOODWILL, SYSTEM_ERROR, FRAUD_DEDUCT, EVENT_BONUS) and points field
- Must work offline (no CDN, no external resources)

---

## Design Implications

- **Architecture**: No RBAC needed in MVP — auth is handled by API Gateway upstream
- **UI/UX**: Single-page, fast-loading, minimal UI. Member ID input → results. No multi-step wizards
- **Data & Privacy**: Agent sees full history for any member (authorized by role via gateway). No PII stored in UI
