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

describe('Phase 4 - Financial Payouts Ledger & Audit API', () => {
  let adminToken, freelancerToken, otherOrgToken;
  let adminUser, freelancerUser, otherOrgAdmin;
  let organization, otherOrganization;
  let event, assignment;

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
      Payout.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // Admin & Org
    adminUser = await User.create({
      name: 'Studio Owner',
      email: 'owner@studio.com',
      password: 'password',
      role: 'admin',
    });

    organization = await Organization.create({
      name: 'Prime Event Studio',
      ownerId: adminUser._id,
      currency: 'INR',
    });

    adminUser.organizationId = organization._id;
    await adminUser.save();

    // Freelancer
    freelancerUser = await User.create({
      name: 'Kiran Videographer',
      email: 'kiran@studio.com',
      password: 'password',
      role: 'freelancer',
      organizationId: organization._id,
    });

    // Other Org (for isolation tests)
    otherOrgAdmin = await User.create({
      name: 'Rival Studio Owner',
      email: 'rival@studio.com',
      password: 'password',
      role: 'admin',
    });

    otherOrganization = await Organization.create({
      name: 'Rival Productions',
      ownerId: otherOrgAdmin._id,
    });

    otherOrgAdmin.organizationId = otherOrganization._id;
    await otherOrgAdmin.save();

    // Event with Base ₹1500, Travel ₹200, Overtime ₹300/hr
    event = await Event.create({
      organizationId: organization._id,
      title: 'Fashion Show Media Coverage',
      date: new Date(),
      startTime: '10:00',
      endTime: '14:00',
      location: { address: 'Park Hyatt, Hyderabad', latitude: 17.4244, longitude: 78.4300, radius: 150 },
      requiredWorkers: 1,
      sessionPay: 1500,
      overtimeRate: 300,
      travelAllowance: 200,
    });

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
    otherOrgToken = jwt.sign(
      { id: otherOrgAdmin._id, email: otherOrgAdmin.email, role: 'admin', organizationId: otherOrganization._id },
      secret
    );
  });

  // ─── 1. AUTO-PAYOUT GENERATION ON CHECKOUT ─────────────────────────
  it('should auto-generate itemized pending payout upon checkout', async () => {
    // Check-in
    await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: 17.4244, longitude: 78.4300 });

    // Check-out on time
    await request(app)
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({ eventId: event._id, latitude: 17.4244, longitude: 78.4300 });

    // Verify Payout was auto-provisioned
    const payout = await Payout.findOne({ freelancerId: freelancerUser._id, eventId: event._id });
    expect(payout).toBeDefined();
    expect(payout.basePay).toBe(1500);
    expect(payout.travelAllowance).toBe(200);
    expect(payout.overtimePay).toBe(0);
    expect(payout.totalAmount).toBe(1700);
    expect(payout.status).toBe('pending');
  });

  // ─── 2. OVERTIME APPROVAL DYNAMICALLY UPDATES PAYOUT ───────────────
  it('should include overtime in payout only after admin approves it', async () => {
    // Attendance with 60 mins overtime
    const attendance = await Attendance.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      assignmentId: assignment._id,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() - 60 * 60 * 1000),
      checkInAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      checkOutAt: new Date(),
      status: 'completed',
      overtimeMinutes: 60,
      overtimeStatus: 'pending',
    });

    // Generate initial payout
    const genRes = await request(app)
      .post(`/api/payouts/generate/${attendance._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(genRes.status).toBe(201);
    expect(genRes.body.overtimePay).toBe(0); // Overtime not approved yet!
    expect(genRes.body.totalAmount).toBe(1700);

    // Admin approves 60 mins overtime (60m @ ₹300/hr = ₹300)
    await request(app)
      .patch(`/api/attendance/${attendance._id}/review-overtime`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve', approvedMinutes: 60 });

    // Verify Payout auto-updated to ₹2000
    const updatedPayout = await Payout.findOne({ attendanceId: attendance._id });
    expect(updatedPayout.overtimePay).toBe(300);
    expect(updatedPayout.totalAmount).toBe(2000); // 1500 + 200 + 300
  });

  // ─── 3. APPROVE & MARK PAID WORKFLOW WITH AUDIT LOG ────────────────
  it('should approve payout and freeze it when marked as paid with audit trail', async () => {
    const attendance = await Attendance.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      assignmentId: assignment._id,
      scheduledStart: new Date(),
      scheduledEnd: new Date(),
      status: 'completed',
    });

    const payout = await Payout.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      attendanceId: attendance._id,
      basePay: 1500,
      travelAllowance: 200,
      totalAmount: 1700,
      status: 'pending',
    });

    // 1. Admin Approves Payout
    const approveRes = await request(app)
      .patch(`/api/payouts/${payout._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.payout.status).toBe('approved');

    // 2. Admin Marks Paid with UPI Reference
    const paidRes = await request(app)
      .patch(`/api/payouts/${payout._id}/paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentReference: 'UPI-9849204921', notes: 'GPay transfer' });

    expect(paidRes.status).toBe(200);
    expect(paidRes.body.payout.status).toBe('paid');
    expect(paidRes.body.payout.paymentReference).toBe('UPI-9849204921');

    // 3. Verify Audit Logs were created
    const logs = await AuditLog.find({ entityId: payout._id });
    expect(logs.length).toBe(2);
    expect(logs.some((l) => l.action === 'APPROVE_PAYOUT')).toBe(true);
    expect(logs.some((l) => l.action === 'MARK_PAYOUT_PAID')).toBe(true);

    // 4. Verify cannot adjust a paid record
    const adjustRes = await request(app)
      .patch(`/api/payouts/${payout._id}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ bonus: 500 });

    expect(adjustRes.status).toBe(400);
    expect(adjustRes.body.message).toMatch(/already paid/i);
  });

  // ─── 4. FREELANCER EARNINGS DASHBOARD ISOLATION ─────────────────────
  it('should allow freelancer to see only their own earnings and summary', async () => {
    const attendance = await Attendance.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      assignmentId: assignment._id,
      scheduledStart: new Date(),
      scheduledEnd: new Date(),
      status: 'completed',
    });

    await Payout.create({
      organizationId: organization._id,
      eventId: event._id,
      freelancerId: freelancerUser._id,
      attendanceId: attendance._id,
      basePay: 1500,
      travelAllowance: 200,
      totalAmount: 1700,
      status: 'paid',
    });

    // Freelancer queries earnings summary
    const earningsRes = await request(app)
      .get('/api/payouts/freelancer/earnings')
      .set('Authorization', `Bearer ${freelancerToken}`);

    expect(earningsRes.status).toBe(200);
    expect(earningsRes.body.totalPaid).toBe(1700);
    expect(earningsRes.body.completedGigsCount).toBe(1);

    // Rival Org Admin queries summary -> sees 0
    const summaryRes = await request(app)
      .get('/api/payouts/summary')
      .set('Authorization', `Bearer ${otherOrgToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.paidTotal).toBe(0); // Multi-tenant isolation verified
  });
});
