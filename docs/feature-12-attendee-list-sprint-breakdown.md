# Feature 12 - Attendee List (Organizer/Admin)

This document explains, in detail, what was added for Feature 12 across sprint goals, how backend and UI pieces were connected, and one concrete problem encountered during implementation.

---

## Feature Summary

Feature 12 adds organizer/admin visibility into event RSVPs, grouped by status, with role-restricted access and inline loading from event detail.

Expected behavior:

1. Organizer can view attendee list for their event.
2. Admin can view attendee list for any event.
3. Members cannot view attendee list.
4. Data is grouped by RSVP status (`going`, `waitlisted`, `cancelled`).
5. Each row includes attendee display name and RSVP creation time.
6. List loads inline on event detail via HTMX.
7. Panel is toggleable via Alpine and hidden by default.

---

## Sprint 1 - Route, Service, Authorization, Grouping

### What was added

#### Service contract extension

`IEventDetailService` gained:

- `getAttendeeList(eventId, actor)`

This method:

1. Normalizes and validates event ID.
2. Fetches event and applies visibility rules.
3. Enforces attendee-list authorization:
   - allow admin
   - allow event organizer
   - deny all others
4. Fetches attendee rows from repository.
5. Groups rows into attending/waitlisted/cancelled buckets.

#### Repository contract extension

`IHomeContentRepository` gained:

- `listAttendeesForEvent(eventId)`

In-memory and Prisma implementations were updated to support this contract.

### Why this matters

This sprint established proper ownership and security boundaries at service level, so UI cannot accidentally expose attendee details to unauthorized roles.

---

## Sprint 2 - Tests + Inline HTMX Rendering on Event Detail

### What was added

#### App and service tests

Coverage was expanded to include:

- organizer/admin can access attendee list
- member access is denied
- grouped output contains expected status partitions
- list content appears inline when loaded from event detail

#### Controller route handling

`EventDetailController` gained:

- `showAttendeeList(req, res)`

Response mapping:

- `200` with attendee panel partial for success
- `403` for authorization failures
- `404` for missing/hidden events
- `500` for dependency failures

#### Route registration

`app.ts` now includes:

- `GET /events/:id/attendees`

guarded by authenticated-session middleware, then delegated to attendee-list controller method.

### Why this matters

A dedicated endpoint + controller path enables targeted HTMX updates and clean separation of concerns from full-page event detail rendering.

---

## Sprint 3 - Prisma Join with Auth/User Data

### What was added

`PrismaHomeRepository.listAttendeesForEvent` now reads RSVPs with joined user data:

- `include: { user: true }`
- ordered by `createdAt asc`

Mapped output includes:

- `userId`
- `displayName` (from auth user table)
- `status`
- `createdAt`

In-memory repository was also aligned to return display names using seeded demo users where possible to preserve parity between modes.

### Why this matters

The feature requirement explicitly demands display names. A raw RSVP table is not enough; user join logic was required to return meaningful attendee identity data.

---

## Sprint 4 - Styled Panel + Alpine Toggle UX

### What was added

#### Event detail UI integration

`src/views/events/detail.ejs` gained an attendee-list section shown only when `event.canViewAttendees` is true:

- hidden by default (`open: false`)
- `View attendee list` button triggers:
  - Alpine `open = true`
  - HTMX GET to `/events/:id/attendees`
  - inline injection into target container
- `Hide attendee list` button collapses panel.

#### Dedicated attendee panel partial

`src/views/events/partials/attendee-list-panel.ejs` renders:

- three visually distinct grouped sections
- count per group in heading
- row entries with:
  - attendee display name
  - human-readable RSVP timestamp

Empty-state text per group is included when a bucket has no rows.

### Why this matters

The feature requirement is not only data retrieval but usability. Grouped styling + toggle behavior makes large RSVP sets readable and avoids visual clutter when list is not needed.

---

## Supporting Data/Type Additions

Feature 12 required type-level additions for clarity and safety:

- `IAttendeeListEntryView`
- `IAttendeeListView`
- `IEventDetailView.canViewAttendees`

These made authorization-driven rendering explicit and allowed the event detail template to gate organizer/admin-only controls safely.

---

## End-to-End Behavior After Implementation

For organizer/admin:

1. Open event detail.
2. Click `View attendee list`.
3. Panel loads inline without full refresh.
4. Entries appear grouped and ordered by RSVP time.
5. Toggle can hide/show section.

For members:

- attendee endpoint access returns authorization failure and attendee data stays hidden.

---

## One Problem Faced (Feature-Level)

### Problem

After expanding service/controller behavior, TypeScript union narrowing in attendee-list controller handling did not infer the error branch strongly enough in one code path.

### Impact

Build failed with errors when accessing `.name` and `.message` on result values that TypeScript still considered potentially successful values.

### Resolution

Controller logic was adjusted to a strict discriminated branch (`if (result.ok === false)`) before error property access. This resolved compilation and ensured reliable error mapping behavior.

---

## Final Validation Status

Feature 12 was validated by:

- service-layer grouping and authorization tests
- app-layer route and rendering tests
- full test-suite pass after integration changes
- browser QA workflow documented separately for organizer/admin/member flows

The attendee-list feature is now implemented end-to-end across authorization, service, repository, and UI interaction layers.

