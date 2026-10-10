const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../server');

describe('Server Route Verification & Healthcheck', () => {
  beforeAll(async () => {
    const testUri = process.env.MONGO_URI_TEST || (
      process.env.MONGO_URI
        ? process.env.MONGO_URI.replace('/crm?', '/crm_test?').replace(/\/crm$/, '/crm_test')
        : 'mongodb://localhost:27017/crm_test'
    );
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(testUri);
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('GET / should return 200 OK (Static HTML or API Landing)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  it('GET /api should return active API directory', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.service).toBe('Plexis Workforce CRM API');
  });

  it('GET /health should return ok health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('Plexis Workforce CRM API');
  });

  it('GET /api/health should return ok health status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/auth/login should respond with validation for invalid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'fake@example.com', password: 'wrong' });
    expect([400, 401, 404]).toContain(res.status);
  });

  it('Protected routes should require token (401)', async () => {
    const [eventsRes, attRes, payoutsRes, leadsRes] = await Promise.all([
      request(app).get('/api/events'),
      request(app).get('/api/attendance'),
      request(app).get('/api/payouts'),
      request(app).get('/api/leads'),
    ]);
    expect(eventsRes.status).toBe(401);
    expect(attRes.status).toBe(401);
    expect(payoutsRes.status).toBe(401);
    expect(leadsRes.status).toBe(401);
  });
});
