# Feature 9 - Waitlist Promotion

This document explains, in detail, what was added for Feature 9 across the sprint goals, how the implementation evolved from service logic to persistence and UI behavior, and one real problem encountered while integrating the feature.

---

## Feature Summary

Feature 9 introduces automatic waitlist promotion when an attending member cancels RSVP. It also adds queue-position visibility for waitlisted users on the event detail page.

Core business expectation:

1. If a `going` RSVP is cancelled and at least one `waitlisted` RSVP exists for the same event, the earliest waitlisted RSVP is promoted to `going`.
2. Cancellation and promotion must be atomic.
3. Waitlisted users can see their queue position.

---

## Sprint 1 - Core Domain and Service Behavior

### What was added

The RSVP toggle flow in `EventDetailService` was extended so cancellation behavior is status-aware:

- **If current status is `going`**:
  - The service calls a dedicated repository operation that performs cancel + promotion as one unit (`cancelGoingRsvpAndPromoteNextWaitlisted`).
- **If current status is `waitlisted`**:
  - A normal upsert changes status to `cancelled`.
- **If user has no active RSVP**:
  - The service keeps existing rules: `going` if capacity available, otherwise `waitlisted`.

This separated "cancel + promote" from ordinary upsert paths and made the intention explicit at service level.

### Why this matters

Without this branch split, `going` cancellation would only mark the user cancelled and could leave open seats while waitlisted users remained blocked. The service now treats `going` cancellation as an event-capacity transition, not just a personal RSVP update.

---

## Sprint 2 - Tests for Promotion and Queue Semantics

### What was added

Service-layer tests were expanded in `test/events/EventRsvpToggleService.test.ts` to cover:

- Promotion occurs when a `going` attendee cancels and waitlist exists.
- No promotion occurs when waitlist is empty.
- Waitlist ordering respects earliest `createdAt`.
- Non-going cancellation (`waitlisted -> cancelled`) does not trigger promotion.

`test/events/EventDetailService.test.ts` also validates queue position behavior:

- A waitlisted member receives correct `waitlistPosition` based on ordered waitlisted rows.

### Why this matters

These tests lock in the business rules so regressions are caught quickly, especially around ordering (which is a common source of subtle bugs in queue logic).

---

## Sprint 3 - Prisma Transaction and Persistence Integration

### What was added

A repository contract extension was introduced in `HomeRepository`:

- `cancelGoingRsvpAndPromoteNextWaitlisted(eventId, userId)`

Then implemented in `PrismaHomeRepository` using:

- `prisma.$transaction(...)`

Inside the transaction:

1. Locate current RSVP by `(eventId, userId)`.
2. Ensure it is `going`.
3. Update current RSVP to `cancelled`.
4. Select earliest waitlisted RSVP for same event (`orderBy createdAt asc`).
5. If found, update that RSVP to `going`.
6. Return identifiers for cancelled/promoted rows.

In-memory parity was maintained in `InMemoryHomeRepository` with the same behavioral contract, ensuring tests and runtime modes remain aligned.

### Why this matters

If cancel and promote are separate DB actions without a transaction, a failure between steps can produce inconsistent state (seat opens but no promotion, or partially updated queue). Transaction wrapping prevents these partial outcomes.

---

## Sprint 4 - Distinct Waitlist Position UI

### What was added

The event detail action area now renders waitlist position with distinct styling when:

- user RSVP status is `waitlisted`
- position is known

In `src/views/events/partials/rsvp-action-area.ejs`, a dedicated visual block was added:

- message format: `Waitlist position: #<N>`
- unique color treatment to distinguish it from default RSVP helper text.

### Why this matters

Queue position is not just metadata; users use it for decision-making (stay waitlisted vs cancel). Distinct styling makes it visible and less likely to be overlooked.

---

## Supporting Data/Type Changes

To support queue and promotion behavior, these model-level improvements were introduced:

- `IEventDetailView` now includes `waitlistPosition`.
- Service uses ordered event RSVP reads to compute queue position for the current actor.
- Repository now exposes explicit operations for:
  - list RSVPs by event
  - atomic cancel+promote

This made behavior explicit and testable instead of inferred from generic upserts.

---

## End-to-End Behavior After Implementation

With feature complete:

1. User on full event joins as `waitlisted`.
2. A `going` attendee cancels.
3. System immediately promotes first waitlisted user.
4. Remaining waitlisted members shift position.
5. UI reflects new status and queue position on refresh/partial update.

---

## One Problem Faced (Feature-Level)

### Problem

A TypeScript narrowing issue appeared while integrating attendee-list related branches and new `Result` unions, causing compile errors when reading `.name`/`.message` from a value that TypeScript still considered a success-or-error union.

### Impact

The app failed to build (`npm run dev` stopped during TypeScript compile), blocking runtime verification in browser.

### Resolution

Controller logic was rewritten to explicitly branch on `if (result.ok === false)` before reading error fields. This gave TypeScript a clear discriminant path and restored build stability.

Although this surfaced in controller code, it was triggered by the broader feature expansion of result shapes and was resolved by stricter union handling discipline.

---

## Final Validation Status

Feature logic was validated through:

- targeted service tests for promotion/ordering
- event detail tests for queue position
- full suite run after integration adjustments
- browser-oriented QA flow documented separately

Result: waitlist promotion behavior, queue position computation, transactional persistence path, and UI visibility are all implemented and verifiable.

