const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { app } = require('../server');

const User = require('../models/User');
const Organization = require('../models/Organization');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');

jest.setTimeout(30000);

describe('Phase 2 - Event Management & Assignment API', () => {
  let adminToken, freelancerToken, otherOrgToken;
  let adminUser, freelancerUser, otherOrgAdmin;
  let organization, otherOrganization;

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

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Organization.deleteMany({}),
      Event.deleteMany({}),
      Assignment.deleteMany({}),
    ]);

    // Create Main Organization & Admin
    adminUser = await User.create({
      name: 'Owner Admin',
      email: 'owner@studio.com',
      password: 'hashedpassword',
      role: 'admin',
    });

    organization = await Organization.create({
      name: 'Royal Lens Studios',
      ownerId: adminUser._id,
      currency: 'INR',
    });

    adminUser.organizationId = organization._id;
    await adminUser.save();

    // Create Freelancer in Main Organization
    freelancerUser = await User.create({
      name: 'Rahul Photographer',
      email: 'rahul@studio.com',
      password: 'hashedpassword',
      role: 'freelancer',
      organizationId: organization._id,
    });

    // Create Other Organization & Admin for Multi-Tenant Isolation Testing
    otherOrgAdmin = await User.create({
      name: 'Other Org Admin',
      email: 'other@studio.com',
      password: 'hashedpassword',
      role: 'admin',
    });

    otherOrganization = await Organization.create({
      name: 'Competitor Studio',
      ownerId: otherOrgAdmin._id,
    });

    otherOrgAdmin.organizationId = otherOrganization._id;
    await otherOrgAdmin.save();

    // Generate JWT tokens
    const secret = process.env.JWT_SECRET || 'secret';
    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: 'admin', organizationId: organization._id },
      secret
    );
    freelancerToken = jwt.sign(
      { id: freelancerUser._id, email: freelancerUser.email, role: 'freelancer', organizationId: organization._id },
      secret
    );
    otherOrgToken = jwt.sign(
      { id: otherOrgAdmin._id, email: otherOrgAdmin.email, role: 'admin', organizationId: otherOrganization._id },
      secret
    );
  });

  // ─── 1. EVENT CREATION ─────────────────────────────────────────────
  it('should allow Admin to create an event with geofence and rates', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Luxury Wedding Reception',
        date: '2026-11-20',
        startTime: '18:00',
        endTime: '23:00',
        location: {
          address: 'Taj Krishna, Hyderabad',
          latitude: 17.4168,
          longitude: 78.4526,
          radius: 200,
        },
        requiredWorkers: 2,
        sessionPay: 2500,
        overtimeRate: 400,
        travelAllowance: 300,
        assignmentMode: 'direct',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Luxury Wedding Reception');
    expect(res.body.location.radius).toBe(200);
    expect(res.body.sessionPay).toBe(2500);
    expect(res.body.organizationId.toString()).toBe(organization._id.toString());
  });

  it('should forbid Freelancer from creating events', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({
        title: 'Hacked Event',
        date: '2026-11-20',
        startTime: '18:00',
        endTime: '23:00',
        location: { address: 'Venue', latitude: 17.0, longitude: 78.0 },
      });

    expect(res.status).toBe(403);
  });

  // ─── 2. MULTI-TENANT ISOLATION ─────────────────────────────────────
  it('should isolate events across different organizations', async () => {
    // Org A creates an event
    await Event.create({
      organizationId: organization._id,
      title: 'Org A Secret Shoot',
      date: new Date(),
      startTime: '09:00',
      endTime: '12:00',
      location: { address: 'Venue A', latitude: 17.0, longitude: 78.0, radius: 150 },
      requiredWorkers: 1,
      sessionPay: 1000,
    });

    // Org B lists events
    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${otherOrgToken}`);

    expect(res.status).toBe(200);
    expect(res.body.events.length).toBe(0); // Org B cannot see Org A's events!
  });

  // ─── 3. DIRECT ASSIGNMENT & CAPACITY ENFORCEMENT ───────────────────
  it('should directly assign a worker and enforce capacity limit', async () => {
    const event = await Event.create({
      organizationId: organization._id,
      title: 'Solo Photo Booth',
      date: new Date(),
      startTime: '10:00',
      endTime: '14:00',
      location: { address: 'Mall', latitude: 17.0, longitude: 78.0, radius: 100 },
      requiredWorkers: 1, // Only 1 worker needed!
      sessionPay: 1200,
    });

    // Assign Rahul (Worker 1)
    const assignRes = await request(app)
      .post(`/api/events/${event._id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ freelancerId: freelancerUser._id });

    expect(assignRes.status).toBe(201);
    expect(assignRes.body.status).toBe('assigned');

    // Create a second freelancer
    const freelancer2 = await User.create({
      name: 'Second Worker',
      email: 'worker2@studio.com',
      password: 'hash',
      role: 'freelancer',
      organizationId: organization._id,
    });

    // Attempt to assign Worker 2 -> should fail due to capacity reached (1/1)
    const overCapacityRes = await request(app)
      .post(`/api/events/${event._id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ freelancerId: freelancer2._id });

    expect(overCapacityRes.status).toBe(400);
    expect(overCapacityRes.body.message).toMatch(/capacity reached/i);
  });

  // ─── 4. OPEN EVENT APPLICATION & APPROVAL ──────────────────────────
  it('should allow freelancer to apply for open event and admin to approve', async () => {
    const openEvent = await Event.create({
      organizationId: organization._id,
      title: 'Open Concert Shoot',
      date: new Date(),
      startTime: '17:00',
      endTime: '22:00',
      location: { address: 'Stadium', latitude: 17.0, longitude: 78.0, radius: 150 },
      requiredWorkers: 2,
      sessionPay: 2000,
      assignmentMode: 'open',
      status: 'upcoming',
    });

    // Freelancer applies
    const applyRes = await request(app)
      .post(`/api/events/${openEvent._id}/apply`)
      .set('Authorization', `Bearer ${freelancerToken}`);

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.status).toBe('applied');

    const assignmentId = applyRes.body._id;

    // Admin accepts application
    const reviewRes = await request(app)
      .patch(`/api/events/${openEvent._id}/applications/${assignmentId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'accept' });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe('accepted');
  });

  // ─── 5. EVENT CANCELLATION ─────────────────────────────────────────
  it('should cancel event and update associated assignments to cancelled', async () => {
    const event = await Event.create({
      organizationId: organization._id,
      title: 'Rainout Outdoor Shoot',
      date: new Date(),
      startTime: '09:00',
      endTime: '12:00',
      location: { address: 'Park', latitude: 17.0, longitude: 78.0, radius: 100 },
      requiredWorkers: 1,
      sessionPay: 1000,
    });

    await Assignment.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      status: 'assigned',
    });

    const cancelRes = await request(app)
      .patch(`/api/events/${event._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.event.status).toBe('cancelled');

    const updatedAssignment = await Assignment.findOne({ eventId: event._id });
    expect(updatedAssignment.status).toBe('cancelled');
  });
});
