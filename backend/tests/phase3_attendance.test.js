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
const Attendance = require('../models/Attendance');
const AttendanceRequest = require('../models/AttendanceRequest');
const AuditLog = require('../models/AuditLog');

jest.setTimeout(30000);

describe('Phase 3 - Attendance Engine, Geofencing & Overtime API', () => {
  let adminToken, freelancerToken, unassignedWorkerToken;
  let adminUser, freelancerUser, unassignedUser;
  let organization, event;
  let assignment;

  // Venue coordinates: HICC Novotel, Hyderabad (17.4722, 78.3728)
  const venueLat = 17.4722;
  const venueLon = 78.3728;
  const venueRadius = 150; // meters

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
      Attendance.deleteMany({}),
      AttendanceRequest.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // Admin & Org
    adminUser = await User.create({
      name: 'Owner Admin',
      email: 'owner@studio.com',
      password: 'password',
      role: 'admin',
    });

    organization = await Organization.create({
      name: 'Apex Event Agency',
      ownerId: adminUser._id,
    });

    adminUser.organizationId = organization._id;
    await adminUser.save();

    // Assigned Freelancer
    freelancerUser = await User.create({
      name: 'Priya Photographer',
      email: 'priya@studio.com',
      password: 'password',
      role: 'freelancer',
      organizationId: organization._id,
    });

    // Unassigned Freelancer
    unassignedUser = await User.create({
      name: 'Unassigned Worker',
      email: 'unassigned@studio.com',
      password: 'password',
      role: 'freelancer',
      organizationId: organization._id,
    });

    // Event
    event = await Event.create({
      organizationId: organization._id,
      title: 'Grand Tech Expo Booth',
      date: new Date(),
      startTime: '09:00',
      endTime: '12:00',
      location: {
        address: 'HICC Novotel, Hyderabad',
        latitude: venueLat,
        longitude: venueLon,
        radius: venueRadius,
      },
      requiredWorkers: 2,
      sessionPay: 1500,
      overtimeRate: 300,
      travelAllowance: 200,
    });

    // Assign Priya to Event
    assignment = await Assignment.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      status: 'assigned',
    });

    const secret = process.env.JWT_SECRET || 'secret';
    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: 'admin', organizationId: organization._id },
      secret
    );
    freelancerToken = jwt.sign(
      { id: freelancerUser._id, email: freelancerUser.email, role: 'freelancer', organizationId: organization._id },
      secret
    );
    unassignedWorkerToken = jwt.sign(
      { id: unassignedUser._id, email: unassignedUser.email, role: 'freelancer', organizationId: organization._id },
      secret
    );
  });

  // ─── 1. VERIFIED CHECK-IN WITHIN GEOFENCE ──────────────────────────
  it('should verify check-in within geofence radius', async () => {
    // 30 meters away from venue center
    const workerLat = 17.4724;
    const workerLon = 78.3729;

    const res = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({
        eventId: event._id,
        latitude: workerLat,
        longitude: workerLon,
        accuracy: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('checked_in');
    expect(res.body.attendance.checkInLocation.isWithinGeofence).toBe(true);
    expect(res.body.attendance.checkInLocation.distanceFromVenue).toBeLessThanOrEqual(venueRadius);
  });

  // ─── 2. CHECK-IN OUTSIDE GEOFENCE (MANUAL REVIEW) ──────────────────
  it('should flag check-in outside geofence for manual review', async () => {
    // ~5 km away (Hyderabad Airport road)
    const workerFarLat = 17.4300;
    const workerFarLon = 78.4000;

    const res = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({
        eventId: event._id,
        latitude: workerFarLat,
        longitude: workerFarLon,
        accuracy: 15,
      });

    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('manual_review');
    expect(res.body.attendance.checkInLocation.isWithinGeofence).toBe(false);
    expect(res.body.attendance.checkInLocation.distanceFromVenue).toBeGreaterThan(venueRadius);
  });

  // ─── 3. REJECT UNASSIGNED WORKER CHECK-IN ───────────────────────────
  it('should reject check-in if worker is not assigned to the event', async () => {
    const res = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${unassignedWorkerToken}`)
      .send({
        eventId: event._id,
        latitude: venueLat,
        longitude: venueLon,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not assigned/i);
  });

  // ─── 4. IDEMPOTENT CHECK-IN (DOUBLE TAP PROTECTION) ────────────────
  it('should prevent duplicate check-in sessions for the same shift', async () => {
    // First check-in
    await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: venueLat, longitude: venueLon });

    // Second check-in attempt
    const secondRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: venueLat, longitude: venueLon });

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.message).toMatch(/already checked in/i);

    // Total attendance records must remain exactly 1
    const totalRecords = await Attendance.countDocuments({ eventId: event._id, freelancerId: freelancerUser._id });
    expect(totalRecords).toBe(1);
  });

  // ─── 5. CHECKOUT WITH OVERTIME DETECTION ───────────────────────────
  it('should detect overtime when checkout exceeds scheduled shift end', async () => {
    // Check in first
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: venueLat, longitude: venueLon });

    const attendanceId = checkInRes.body.attendance._id;

    // Simulate scheduledEnd in the past (e.g., 2 hours ago)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await Attendance.findByIdAndUpdate(attendanceId, { scheduledEnd: twoHoursAgo });

    // Checkout now
    const checkOutRes = await request(app)
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: venueLat, longitude: venueLon });

    expect(checkOutRes.status).toBe(200);
    expect(checkOutRes.body.attendance.status).toBe('completed');
    expect(checkOutRes.body.attendance.overtimeMinutes).toBeGreaterThanOrEqual(119);
    expect(checkOutRes.body.attendance.overtimeStatus).toBe('pending');
  });

  // ─── 6. ADMIN OVERTIME APPROVAL ────────────────────────────────────
  it('should allow Admin to review and approve overtime claim', async () => {
    const attendance = await Attendance.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      assignmentId: assignment._id,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() - 60 * 60 * 1000),
      checkInAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      checkOutAt: new Date(),
      status: 'completed',
      overtimeMinutes: 60,
      overtimeStatus: 'pending',
    });

    const reviewRes = await request(app)
      .patch(`/api/attendance/${attendance._id}/review-overtime`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve', approvedMinutes: 60, note: 'Approved 1h extra work' });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.attendance.overtimeStatus).toBe('approved');
    expect(reviewRes.body.attendance.overtimeMinutes).toBe(60);

    // Verify audit log entry was created
    const log = await AuditLog.findOne({ entityId: attendance._id });
    expect(log).toBeDefined();
    expect(log.action).toBe('APPROVE_OVERTIME');
  });

  // ─── 7. EXCEPTION REQUEST (PHONE DEAD) ─────────────────────────────
  it('should allow worker to submit exception request and admin to approve it', async () => {
    // Worker submits exception request
    const reqRes = await request(app)
      .post('/api/attendance/request-correction')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({
        eventId: event._id,
        requestType: 'missing_checkin',
        requestedCheckIn: new Date(),
        reason: 'Phone battery died during morning shoot',
      });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.request.status).toBe('pending');

    const requestId = reqRes.body.request._id;

    // Admin approves request
    const reviewRes = await request(app)
      .patch(`/api/attendance/requests/${requestId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve', reviewNote: 'Confirmed with event manager' });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.request.status).toBe('approved');

    // Verify Attendance was created with method 'manual'
    const manualAttendance = await Attendance.findOne({ freelancerId: freelancerUser._id, checkInMethod: 'manual' });
    expect(manualAttendance).toBeDefined();
    expect(manualAttendance.status).toBe('approved');
  });

  // ─── 8. SHIFT EXTENSION & AUTO-CHECKOUT PROTECTION ─────────────────
  it('should extend shift and prevent auto-checkout from stopping shift', async () => {
    // Check in
    const checkInRes = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: venueLat, longitude: venueLon });

    const attendanceId = checkInRes.body.attendance._id;

    // Extend Shift
    const extendRes = await request(app)
      .post('/api/attendance/extend')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ attendanceId });

    expect(extendRes.status).toBe(200);
    expect(extendRes.body.attendance.isExtended).toBe(true);
    expect(extendRes.body.attendance.extendedAt).toBeDefined();

    // Verify audit log
    const extendLog = await AuditLog.findOne({ entityId: attendanceId, action: 'SHIFT_EXTENDED' });
    expect(extendLog).toBeDefined();

    // Try auto-checkout -> must be blocked
    const autoRes = await request(app)
      .post('/api/attendance/auto-checkout')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ attendanceId });

    expect(autoRes.status).toBe(400);
    expect(autoRes.body.message).toMatch(/extended/i);

    // Verify shift is still active
    const attAfter = await Attendance.findById(attendanceId);
    expect(attAfter.status).toBe('checked_in');
  });
});

