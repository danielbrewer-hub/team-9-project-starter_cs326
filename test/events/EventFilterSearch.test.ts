import request from 'supertest'
import { createComposedApp } from '../../src/composition'
import { createStoredEvent } from '../../src/home/InMemoryHomeRepository'

// Create the app once for all tests in this file
const appInstance = createComposedApp()
const server = appInstance.getExpressApp()

// Seed future-dated test events so they appear in filter/search results.
// The default seeded events have past dates (April 18/20) so they are
// automatically excluded by the service's "upcoming only" filter.
const oneDayFromNow = new Date()
oneDayFromNow.setDate(oneDayFromNow.getDate() + 1)
const twoDaysFromNow = new Date()
twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2)

createStoredEvent({
  id: 'test-social-event',
  title: 'Community Social Mixer',
  description: 'A fun social gathering for the community',
  location: 'Campus Center',
  category: 'social',
  status: 'published',
  capacity: 50,
  startDatetime: oneDayFromNow.toISOString(),
  endDatetime: twoDaysFromNow.toISOString(),
  organizerId: 'user-admin',
})

createStoredEvent({
  id: 'test-edu-event',
  title: 'Web Programming Workshop',
  description: 'Learn the basics of HTML CSS and JavaScript',
  location: 'CS Lab 101',
  category: 'educational',
  status: 'published',
  startDatetime: oneDayFromNow.toISOString(),
  endDatetime: twoDaysFromNow.toISOString(),
  organizerId: 'user-admin',
})

createStoredEvent({
  id: 'test-draft-event',
  title: 'Draft Event Should Not Show',
  description: 'This is a draft event',
  location: 'Nowhere',
  category: 'social',
  status: 'draft',
  startDatetime: oneDayFromNow.toISOString(),
  endDatetime: twoDaysFromNow.toISOString(),
  organizerId: 'user-admin',
})

// Helper: log in as admin and return a persistent cookie agent
async function loginAsAdmin() {
  const agent = request.agent(server)
  await agent
    .post('/login')
    .type('form')
    .send({ email: 'admin@app.test', password: 'password123' })
  return agent
}

// ── Feature 6: Category & Date Filter ────────────────────────────────────────

describe('GET /events — Feature 6: Category & Date Filter', () => {
  it('returns 200 with published events for an authenticated user', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Community Social Mixer')
    expect(res.text).toContain('Web Programming Workshop')
  })

  it('filters results down to the requested category', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events?category=social')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Community Social Mixer')
    expect(res.text).not.toContain('Web Programming Workshop')
  })

  it('returns all published events when an invalid category is provided', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events?category=not-a-real-category')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Community Social Mixer')
    expect(res.text).toContain('Web Programming Workshop')
  })

  it('does not show draft events regardless of filter', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events')
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('Draft Event Should Not Show')
  })

  it('redirects unauthenticated GET requests to /login', async () => {
    const res = await request(server).get('/events')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('returns an HTML partial (no full page layout) for HTMX requests', async () => {
    const agent = await loginAsAdmin()
    const res = await agent
      .get('/events')
      .set('HX-Request', 'true')
    expect(res.status).toBe(200)
    expect(res.text).toContain('event-list')
    expect(res.text).not.toContain('<html')
  })
})

// ── Feature 10: Event Search ──────────────────────────────────────────────────

describe('GET /events/search — Feature 10: Event Search', () => {
  it('returns 200 with events matching the query', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events/search?q=Social')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Community Social Mixer')
  })

  it('returns all published upcoming events for an empty query', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events/search?q=')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Community Social Mixer')
    expect(res.text).toContain('Web Programming Workshop')
  })

  it('matches against the event description field', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events/search?q=basics+of+HTML')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Web Programming Workshop')
  })

  it('matches against the event location field', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events/search?q=Campus+Center')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Community Social Mixer')
  })

  it('shows an error message when the query exceeds 200 characters', async () => {
    const agent = await loginAsAdmin()
    const longQuery = 'a'.repeat(201)
    const res = await agent.get(`/events/search?q=${longQuery}`)
    expect(res.status).toBe(200)
    expect(res.text).toContain('Search query cannot exceed 200 characters')
  })

  it('shows "No events found" when no events match the query', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events/search?q=xyznoexistevent99')
    expect(res.status).toBe(200)
    expect(res.text).toContain('No events found')
  })

  it('does not return draft events in search results', async () => {
    const agent = await loginAsAdmin()
    const res = await agent.get('/events/search?q=Draft')
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('Draft Event Should Not Show')
  })

  it('redirects unauthenticated GET requests to /login', async () => {
    const res = await request(server).get('/events/search?q=test')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('returns an HTML partial (no full page layout) for HTMX requests', async () => {
    const agent = await loginAsAdmin()
    const res = await agent
      .get('/events/search?q=Social')
      .set('HX-Request', 'true')
    expect(res.status).toBe(200)
    expect(res.text).toContain('event-list')
    expect(res.text).not.toContain('<html')
  })
})
