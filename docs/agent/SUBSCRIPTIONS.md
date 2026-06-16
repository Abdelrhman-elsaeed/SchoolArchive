# SUBSCRIPTIONS.md - Subscription Enforcement Strategy

This document outlines the design and server-side rules for school subscription lifecycles within the **الأرشيف المدرسي العربي** (Arabic School Archive) system.

---

## 1. Subscription States & Lifecycle

Each school tenant maintains a subscription configuration profile:
- **Active**: The school has paid the annual subscription fee. All operations are permitted.
- **Expired**: The current date is past the subscription end date. Depending on the grace period, actions may be restricted.
- **Suspended**: Manually flagged by system administrators due to policy violations. All write and read operations are completely locked.
- **Canceled**: The school has terminated its contract. Account resources are locked and slated for deletion review.

---

## 2. Grace Period Mechanics
- **Default Duration**: 7 days (defined in application settings, configurable per school).
- **Behavior**: When a subscription passes its expiration date but is within the 7-day grace period, the school remains in an active operational state, but the UI displays warning banners alerting administrators of the upcoming service block:
  `متبقي 3 أيام على انتهاء مهلة التجديد. يرجى تجديد الاشتراك لتفادي إغلاق الحساب.` (3 days remaining in grace period. Please renew to avoid account lock).

---

## 3. Server-Side Enforcement (Zero Client Trust)

- **Backend as Source of Truth**: **Subscription enforcement is server-side only.** The frontend application may display billing states or warnings, but the backend is the absolute authority. 
- **Routing Middleware Guard**: A middleware filter in ASP.NET Core checks the tenant subscription details on *every* inbound API request, validating the active dates stored in SQL DB.

---

## 4. Expired State Behavior (Post-Grace Period Expiry)

Once the subscription status is marked as expired and the 7-day grace period has elapsed, the backend API enforces the following blocking rules:

- **Block Uploads**: 
  - Any request to `POST /api/v1/archive/upload` (single or multi-file) is instantly blocked.
  - Returns HTTP `402 Payment Required` with message: `عذراً، انتهت صلاحية اشتراك المدرسة. يرجى تجديد الاشتراك لتفعيل التحميل`.
- **Block Archive Browsing**:
  - Any request to `GET /api/v1/archive/search` or list indexes is blocked.
  - Returns HTTP `402 Payment Required`. Users cannot browse metadata or documents list.
- **Block Protected Actions**:
  - All read/write requests to protected endpoints, including downloading files (`GET /api/v1/archive/download/{id}`), creating categories, altering tags, or viewing audit logs, are blocked.
  - Returns HTTP `402 Payment Required` or `403 Forbidden`. No SAS tokens are generated.

---

## 5. Renewal Workflows & Scope Boundary
- **No Payment Gateway Integration**: The MVP does not contain automated checkouts, credit card inputs, or payment provider SDKs (e.g. Stripe, Moyasar).
- **Manual Renewal/Admin Workflow**:
  - Schools coordinate payment with sales/billing teams manually (bank transfer, official school purchase orders).
  - System administrators update the school's subscription status, start date, and expiration date using a secure backend admin portal or database update command scripts.
