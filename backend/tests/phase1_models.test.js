const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Organization = require('../models/Organization');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const Payout = require('../models/Payout');
const AttendanceRequest = require('../models/AttendanceRequest');
const AuditLog = require('../models/AuditLog');

jest.setTimeout(30000);

describe('Phase 1 - Multi-Tenancy & Data Models Verification', () => {
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
      AttendanceRequest.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  it('should create an Organization and assign an Admin owner', async () => {
    const admin = await User.create({
      name: 'Studio Owner',
      email: 'owner@studio.com',
      password: 'password123',
      role: 'admin',
    });

    const org = await Organization.create({
      name: 'Golden Lens Productions',
      ownerId: admin._id,
      address: '123 Film Street, Hyderabad',
      currency: 'INR',
    });

    admin.organizationId = org._id;
    await admin.save();

    expect(org._id).toBeDefined();
    expect(org.ownerId.toString()).toBe(admin._id.toString());
  });

  it('should create an Event with geofencing coordinates and session rates', async () => {
    const org = await Organization.create({
      name: 'Pixel Studio',
      ownerId: new mongoose.Types.ObjectId(),
    });

    const event = await Event.create({
      organizationId: org._id,
      title: 'Grand Wedding Shoot',
      date: new Date('2026-10-15'),
      startTime: '09:00',
      endTime: '12:00',
      location: {
        address: 'XYZ Convention Hall, Hyderabad',
        latitude: 17.3850,
        longitude: 78.4867,
        radius: 150,
      },
      requiredWorkers: 3,
      sessionPay: 1500,
      overtimeRate: 300,
      travelAllowance: 200,
      assignmentMode: 'direct',
    });

    expect(event.title).toBe('Grand Wedding Shoot');
    expect(event.location.radius).toBe(150);
    expect(event.sessionPay).toBe(1500);
    expect(event.travelAllowance).toBe(200);
  });

  it('should physically prevent duplicate assignment of the same freelancer to the same event', async () => {
    const org = await Organization.create({ name: 'Studio', ownerId: new mongoose.Types.ObjectId() });
    const freelancer = await User.create({
      name: 'Rahul Photographer',
      email: 'rahul@studio.com',
      password: 'hash',
      role: 'freelancer',
      organizationId: org._id,
    });
    const event = await Event.create({
      organizationId: org._id,
      title: 'Corporate Gala',
      date: new Date(),
      startTime: '10:00',
      endTime: '14:00',
      location: { address: 'Venue', latitude: 12.9716, longitude: 77.5946, radius: 100 },
      requiredWorkers: 2,
      sessionPay: 1200,
    });

    // Ensure index exists in test DB
    await Assignment.init();

    // First assignment succeeds
    await Assignment.create({
      organizationId: org._id,
      eventId: event._id,
      freelancerId: freelancer._id,
      status: 'assigned',
    });

    // Duplicate assignment must throw a duplicate key error (code 11000)
    let error;
    try {
      await Assignment.create({
        organizationId: org._id,
        eventId: event._id,
        freelancerId: freelancer._id,
        status: 'assigned',
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe(11000);
  });

  it('should prevent duplicate payouts for the same attendance session', async () => {
    const org = await Organization.create({ name: 'Studio', ownerId: new mongoose.Types.ObjectId() });
    const freelancerId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();
    const attendanceId = new mongoose.Types.ObjectId();

    await Payout.init();

    await Payout.create({
      organizationId: org._id,
      eventId,
      freelancerId,
      attendanceId,
      basePay: 1500,
      overtimePay: 300,
      travelAllowance: 200,
      totalAmount: 2000,
      status: 'pending',
    });

    let duplicateError;
    try {
      await Payout.create({
        organizationId: org._id,
        eventId,
        freelancerId,
        attendanceId, // Same attendanceId
        basePay: 1500,
        overtimePay: 0,
        travelAllowance: 200,
        totalAmount: 1700,
        status: 'pending',
      });
    } catch (err) {
      duplicateError = err;
    }

    expect(duplicateError).toBeDefined();
    expect(duplicateError.code).toBe(11000);
  });
});
