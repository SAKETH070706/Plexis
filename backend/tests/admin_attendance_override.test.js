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
const Payout = require('../models/Payout');
const AuditLog = require('../models/AuditLog');

jest.setTimeout(30000);

describe('Admin Sovereignty & Flexible Attendance Architecture', () => {
  let adminToken, freelancerToken, freelancer2Token;
  let adminUser, freelancer1, freelancer2;
  let organization, eventAdminManaged, eventFreelancerSelf, eventStrictGeofence;
  let assignment1, assignment2;

  beforeAll(async () => {
    const testUri =
      process.env.MONGO_URI_TEST ||
      (process.env.MONGO_URI
        ? process.env.MONGO_URI.replace('/crm?', '/crm_test?').replace(/\/crm$/, '/crm_test')
        : 'mongodb://localhost:27017/crm_test');
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
      Payout.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // Admin & Org
    adminUser = await User.create({
      name: 'Studio Owner Vikram',
      email: 'vikram@studio.com',
      password: 'password',
      role: 'admin',
    });

    organization = await Organization.create({
      name: 'Royal Frames Studios',
      ownerId: adminUser._id,
    });

    adminUser.organizationId = organization._id;
    await adminUser.save();

    // Freelancers
    freelancer1 = await User.create({
      name: 'Ramesh Photographer',
      email: 'ramesh@camera.com',
      password: 'password',
      role: 'freelancer',
      hourlyRate: 500,
    });

    freelancer2 = await User.create({
      name: 'Suresh Cinematographer',
      email: 'suresh@camera.com',
      password: 'password',
      role: 'freelancer',
      hourlyRate: 600,
    });

    const jwtSecret = process.env.JWT_SECRET || 'testsecret123456';
    adminToken = jwt.sign(
      { id: adminUser._id, role: 'admin', organizationId: organization._id },
      jwtSecret
    );
    freelancerToken = jwt.sign(
      { id: freelancer1._id, role: 'freelancer' },
      jwtSecret
    );
    freelancer2Token = jwt.sign(
      { id: freelancer2._id, role: 'freelancer' },
      jwtSecret
    );

    // Create Event with default admin_managed policy
    eventAdminManaged = await Event.create({
      organizationId: organization._id,
      title: 'Grand Palace Wedding Reception',
      date: new Date(Date.now() + 86400000),
      startTime: '10:00',
      endTime: '16:00',
      sessionPay: 3500,
      totalSlots: 5,
      attendancePolicy: 'admin_managed',
      location: {
        address: 'Taj Palace, New Delhi',
        latitude: 28.5973,
        longitude: 77.1706,
        radius: 150,
      },
      createdBy: adminUser._id,
    });

    // Assignments
    assignment1 = await Assignment.create({
      organizationId: organization._id,
      eventId: eventAdminManaged._id,
      freelancerId: freelancer1._id,
      status: 'assigned',
    });

    assignment2 = await Assignment.create({
      organizationId: organization._id,
      eventId: eventAdminManaged._id,
      freelancerId: freelancer2._id,
      status: 'assigned',
    });

    // Event with freelancer_self policy
    eventFreelancerSelf = await Event.create({
      organizationId: organization._id,
      title: 'Birthday Celebration Shoot',
      date: new Date(),
      startTime: '09:00',
      endTime: '13:00',
      sessionPay: 2000,
      totalSlots: 2,
      attendancePolicy: 'freelancer_self',
      location: {
        address: 'Connaught Place, New Delhi',
        latitude: 28.6315,
        longitude: 77.2167,
        radius: 150,
      },
      createdBy: adminUser._id,
    });

    // Event with strict_geofence policy
    eventStrictGeofence = await Event.create({
      organizationId: organization._id,
      title: 'Corporate Summit 2026',
      date: new Date(),
      startTime: '08:00',
      endTime: '17:00',
      sessionPay: 4500,
      totalSlots: 2,
      attendancePolicy: 'strict_geofence',
      location: {
        address: 'Pragati Maidan, New Delhi',
        latitude: 28.6186,
        longitude: 77.2415,
        radius: 150,
      },
      createdBy: adminUser._id,
    });
  });

  describe('1. Admin Direct Check-In Override (/api/attendance/admin-checkin)', () => {
    it('allows Admin to check in a worker directly with 1 click', async () => {
      const res = await request(app)
        .post('/api/attendance/admin-checkin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: eventAdminManaged._id,
          freelancerId: freelancer1._id,
          notes: 'Marked present at the Taj banquet gate by Vikram',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Worker marked present by Studio Admin');
      expect(res.body.attendance.status).toBe('checked_in');
      expect(res.body.attendance.checkInMethod).toBe('manual');
      expect(res.body.attendance.adminReviewNote).toBe('Marked present at the Taj banquet gate by Vikram');

      // Verify DB record
      const dbRecord = await Attendance.findOne({
        eventId: eventAdminManaged._id,
        freelancerId: freelancer1._id,
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord.status).toBe('checked_in');

      // Verify Audit Log was generated
      const audit = await AuditLog.findOne({
        action: 'ADMIN_CHECKIN_OVERRIDE',
        entityId: dbRecord._id,
      });
      expect(audit).not.toBeNull();
    });

    it('rejects non-admin users from using admin check-in', async () => {
      const res = await request(app)
        .post('/api/attendance/admin-checkin')
        .set('Authorization', `Bearer ${freelancerToken}`)
        .send({
          eventId: eventAdminManaged._id,
          freelancerId: freelancer2._id,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Admin Direct Check-Out Override (/api/attendance/admin-checkout)', () => {
    it('allows Admin to check out worker, mark completed, and auto-queue payout', async () => {
      // First check worker in
      await request(app)
        .post('/api/attendance/admin-checkin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: eventAdminManaged._id,
          freelancerId: freelancer1._id,
        });

      // Now admin checks out worker
      const res = await request(app)
        .post('/api/attendance/admin-checkout')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: eventAdminManaged._id,
          freelancerId: freelancer1._id,
          notes: 'Shoot wrapped early, flawless service',
        });

      expect(res.status).toBe(200);
      expect(res.body.attendance.status).toBe('completed');
      expect(res.body.attendance.checkOutMethod).toBe('manual');

      // Verify Payout was queued
      const payout = await Payout.findOne({
        attendanceId: res.body.attendance._id,
      });
      expect(payout).not.toBeNull();
      expect(payout.totalAmount).toBeGreaterThan(0);
      expect(payout.status).toBe('pending');
    });
  });

  describe('3. Admin Batch Complete All (/api/attendance/admin-complete-all)', () => {
    it('allows Admin to 1-click complete entire crew and generate all payouts', async () => {
      const res = await request(app)
        .post('/api/attendance/admin-complete-all')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: eventAdminManaged._id,
          notes: 'Complete wedding crew finished and approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.message).toContain('All 2 crew members marked completed and queued for payout');

      // Verify both attendances are completed
      const allAttendances = await Attendance.find({ eventId: eventAdminManaged._id });
      expect(allAttendances.length).toBe(2);
      expect(allAttendances.every((a) => a.status === 'completed')).toBe(true);

      // Verify both payouts exist
      const payouts = await Payout.find({ organizationId: organization._id });
      expect(payouts.length).toBe(2);
    });
  });

  describe('4. Admin Direct Override: Mark Absent (/api/attendance/admin-mark-absent)', () => {
    it('allows Admin to mark a worker absent, declining assignment and releasing the slot', async () => {
      const res = await request(app)
        .post('/api/attendance/admin-mark-absent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: eventAdminManaged._id,
          freelancerId: freelancer2._id,
          notes: 'Phone unreachable on wedding morning',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Worker marked absent and shift slot released');

      // Verify assignment was declined
      const updatedAssignment = await Assignment.findById(assignment2._id);
      expect(updatedAssignment.status).toBe('declined');
      expect(updatedAssignment.notes).toContain('Phone unreachable');
    });
  });

  describe('5. Freelancer Self Check-In Policy Geofence Bypass', () => {
    it('bypasses GPS geofence distance check when policy is freelancer_self', async () => {
      // Assign freelancer1 to eventFreelancerSelf
      await Assignment.create({
        organizationId: organization._id,
        eventId: eventFreelancerSelf._id,
        freelancerId: freelancer1._id,
        status: 'assigned',
      });

      // Check in with coordinates far away (e.g. 50km away)
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${freelancerToken}`)
        .send({
          eventId: eventFreelancerSelf._id,
          latitude: 28.0000, // far from 28.6315
          longitude: 77.0000,
          accuracy: 10,
          checkInMethod: 'manual',
          notes: 'Self-reported arrival via 1-tap',
        });

      expect(res.status).toBe(201);
      expect(res.body.attendance.status).toBe('checked_in');
      expect(res.body.attendance.checkInLocation.isWithinGeofence).toBe(true);
    });

    it('enforces GPS geofence distance check when policy is strict_geofence', async () => {
      // Assign freelancer1 to eventStrictGeofence
      await Assignment.create({
        organizationId: organization._id,
        eventId: eventStrictGeofence._id,
        freelancerId: freelancer1._id,
        status: 'assigned',
      });

      // Check in far away
      const res = await request(app)
        .post('/api/attendance/check-in')
        .set('Authorization', `Bearer ${freelancerToken}`)
        .send({
          eventId: eventStrictGeofence._id,
          latitude: 28.0000,
          longitude: 77.0000,
          accuracy: 10,
          checkInMethod: 'gps',
        });

      expect(res.status).toBe(201);
      expect(res.body.attendance.status).toBe('manual_review');
      expect(res.body.attendance.checkInLocation.isWithinGeofence).toBe(false);
      expect(res.body.attendance.checkInLocation.distanceFromVenue).toBeGreaterThan(150);
    });
  });
});
