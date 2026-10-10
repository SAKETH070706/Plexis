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
const Lead = require('../models/Lead');

jest.setTimeout(30000);

describe('Phase 3: Unified GraphQL Layer & Real-Time Dashboard Aggregation', () => {
  let adminUser, adminToken, organization;
  let freelancerUser, freelancerToken;
  let testEvent;

  const signUserToken = (user) => {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || null,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
  };

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
      Lead.deleteMany({}),
    ]);

    // Create Organization & Studio Admin
    adminUser = await User.create({
      name: 'Aditya Studio Owner',
      email: 'aditya@studio.com',
      password: 'password123',
      role: 'admin',
    });

    organization = await Organization.create({
      name: 'Aditya Lens Productions',
      ownerId: adminUser._id,
      studioCode: 'STU-ADITYA',
    });

    adminUser.organizationId = organization._id;
    await adminUser.save();
    adminToken = signUserToken(adminUser);

    // Create Freelancer
    freelancerUser = await User.create({
      name: 'Kiran Cinematographer',
      email: 'kiran@lens.com',
      password: 'password123',
      role: 'freelancer',
      phone: '+91 9876543210',
    });
    freelancerToken = signUserToken(freelancerUser);

    // Create Test Event
    testEvent = await Event.create({
      organizationId: organization._id,
      title: 'Royal Heritage Wedding Shoot',
      date: new Date('2026-11-20'),
      startTime: '09:00',
      endTime: '17:00',
      location: {
        address: 'Taj Falaknuma Palace, Hyderabad',
        latitude: 17.3314,
        longitude: 78.4682,
        radius: 150,
      },
      requiredWorkers: 2,
      sessionPay: 3500,
      overtimeRate: 500,
      travelAllowance: 300,
      attendanceTracking: true,
      eventCode: 'EVT-ROY',
      status: 'upcoming',
    });
  });

  describe('1. Endpoint Accessibility & Security', () => {
    it('GET /graphql returns endpoint healthcheck and metadata', async () => {
      const res = await request(app).get('/graphql');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('online');
      expect(res.body.endpoints.query).toBe('POST /graphql');
    });

    it('POST /graphql blocks unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/graphql')
        .send({ query: '{ freelancerDashboard { user { name } } }' });
      expect(res.status).toBe(401);
    });

    it('POST /graphql returns 400 when query string is missing', async () => {
      const res = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${freelancerToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toContain('query');
    });
  });

  describe('2. Consolidated Freelancer Dashboard Query', () => {
    beforeEach(async () => {
      // Create confirmed assignment
      await Assignment.create({
        organizationId: organization._id,
        eventId: testEvent._id,
        freelancerId: freelancerUser._id,
        status: 'assigned',
        joinedVia: 'event_code',
        eventCode: testEvent.eventCode,
        eventTitle: testEvent.title,
        eventDate: testEvent.date,
        sessionPay: testEvent.sessionPay,
      });

      // Create Payout records
      await Payout.create({
        organizationId: organization._id,
        eventId: testEvent._id,
        freelancerId: freelancerUser._id,
        attendanceId: new mongoose.Types.ObjectId(),
        basePay: 3500,
        totalAmount: 3500,
        status: 'paid',
      });
      await Payout.create({
        organizationId: organization._id,
        eventId: testEvent._id,
        freelancerId: freelancerUser._id,
        attendanceId: new mongoose.Types.ObjectId(),
        basePay: 2000,
        totalAmount: 2000,
        status: 'pending',
      });
    });

    it('fetches complete freelancer dashboard state in 1 single round-trip', async () => {
      const query = `
        query GetFreelancerDashboard {
          freelancerDashboard {
            user {
              id
              name
              email
              phone
              role
            }
            assignedGigs {
              id
              uuid
              title
              eventCode
              date
              startTime
              endTime
              address
              sessionPay
              status
              attendanceTracking
            }
            activeAttendance {
              id
              eventTitle
              status
            }
            earnings {
              totalPaid
              pendingEarnings
              completedGigsCount
              pendingGigsCount
            }
            pendingRequests {
              id
              reason
            }
          }
        }
      `;

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${freelancerToken}`)
        .send({ query });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const { freelancerDashboard } = res.body.data;
      expect(freelancerDashboard).toBeDefined();

      // Verify User Profile
      expect(freelancerDashboard.user.name).toBe('Kiran Cinematographer');
      expect(freelancerDashboard.user.email).toBe('kiran@lens.com');
      expect(freelancerDashboard.user.role).toBe('freelancer');

      // Verify Assigned Gigs
      expect(freelancerDashboard.assignedGigs.length).toBe(1);
      expect(freelancerDashboard.assignedGigs[0].title).toBe('Royal Heritage Wedding Shoot');
      expect(freelancerDashboard.assignedGigs[0].eventCode).toBe('EVT-ROY');
      expect(freelancerDashboard.assignedGigs[0].sessionPay).toBe(3500);
      expect(freelancerDashboard.assignedGigs[0].status).toBe('assigned');
      expect(freelancerDashboard.assignedGigs[0].attendanceTracking).toBe(true);

      // Verify Earnings
      expect(freelancerDashboard.earnings.totalPaid).toBe(3500);
      expect(freelancerDashboard.earnings.pendingEarnings).toBe(2000);
      expect(freelancerDashboard.earnings.completedGigsCount).toBe(1);
      expect(freelancerDashboard.earnings.pendingGigsCount).toBe(1);
    });
  });

  describe('3. Consolidated Admin Dashboard Query', () => {
    beforeEach(async () => {
      // Add lead
      await Lead.create({
        name: 'Priya Sharma (Bride)',
        email: 'priya@weddings.com',
        phone: '+91 9988776655',
        source: 'Instagram',
        status: 'new',
        organizationId: organization._id,
        userId: adminUser._id,
      });

      // Add worker to org
      await User.create({
        name: 'Rohan Drone Specialist',
        email: 'rohan@drone.com',
        password: 'password',
        role: 'freelancer',
        organizationId: organization._id,
      });
    });

    it('fetches complete studio admin overview in 1 single round-trip', async () => {
      const query = `
        query GetAdminDashboard {
          adminDashboard {
            user {
              name
              role
              organizationName
              studioCode
            }
            kpi {
              totalEvents
              activeEvents
              totalWorkers
              pendingOvertimeCount
              pendingPayoutTotal
            }
            upcomingEvents {
              id
              title
              eventCode
              address
              sessionPay
              requiredWorkers
              confirmedWorkersCount
              waitlistedWorkersCount
            }
            recentLeads {
              id
              name
              phone
              status
            }
          }
        }
      `;

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const { adminDashboard } = res.body.data;
      expect(adminDashboard).toBeDefined();

      // Verify Admin & Organization
      expect(adminDashboard.user.name).toBe('Aditya Studio Owner');
      expect(adminDashboard.user.organizationName).toBe('Aditya Lens Productions');
      expect(adminDashboard.user.studioCode).toBe('STU-ADITYA');

      // Verify KPI
      expect(adminDashboard.kpi.totalEvents).toBe(1);
      expect(adminDashboard.kpi.totalWorkers).toBe(1);

      // Verify Upcoming Event
      expect(adminDashboard.upcomingEvents.length).toBe(1);
      expect(adminDashboard.upcomingEvents[0].eventCode).toBe('EVT-ROY');
      expect(adminDashboard.upcomingEvents[0].requiredWorkers).toBe(2);

      // Verify Leads
      expect(adminDashboard.recentLeads.length).toBe(1);
      expect(adminDashboard.recentLeads[0].name).toBe('Priya Sharma (Bride)');
    });

    it('rejects non-admin role from accessing adminDashboard', async () => {
      const query = `
        query GetAdminDashboard {
          adminDashboard {
            user {
              name
            }
          }
        }
      `;

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${freelancerToken}`)
        .send({ query });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain('Admin role required');
    });
  });

  describe('4. Event Detail with Live Roster & Waitlist Query', () => {
    let secondFreelancer;

    beforeEach(async () => {
      secondFreelancer = await User.create({
        name: 'Suresh Backup Cam',
        email: 'suresh@cam.com',
        password: 'password',
        role: 'freelancer',
      });

      // Confirmed crew
      await Assignment.create({
        organizationId: organization._id,
        eventId: testEvent._id,
        freelancerId: freelancerUser._id,
        status: 'assigned',
        joinedVia: 'event_code',
        eventCode: testEvent.eventCode,
        eventTitle: testEvent.title,
        eventDate: testEvent.date,
        sessionPay: testEvent.sessionPay,
      });

      // Waitlisted backup
      await Assignment.create({
        organizationId: organization._id,
        eventId: testEvent._id,
        freelancerId: secondFreelancer._id,
        status: 'waitlist',
        joinedVia: 'event_code',
        eventCode: testEvent.eventCode,
        eventTitle: testEvent.title,
        eventDate: testEvent.date,
        sessionPay: testEvent.sessionPay,
      });
    });

    it('returns event details with partitioned confirmed and waitlist rosters', async () => {
      const query = `
        query GetEventDetail($eventCode: String!) {
          eventDetail(eventCode: $eventCode) {
            title
            eventCode
            address
            sessionPay
            requiredWorkers
            confirmedCrew {
              name
              email
              status
            }
            waitlist {
              name
              email
              status
            }
          }
        }
      `;

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          query,
          variables: { eventCode: 'EVT-ROY' },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const { eventDetail } = res.body.data;
      expect(eventDetail).toBeDefined();
      expect(eventDetail.title).toBe('Royal Heritage Wedding Shoot');
      expect(eventDetail.eventCode).toBe('EVT-ROY');
      expect(eventDetail.confirmedCrew.length).toBe(1);
      expect(eventDetail.confirmedCrew[0].name).toBe('Kiran Cinematographer');
      expect(eventDetail.waitlist.length).toBe(1);
      expect(eventDetail.waitlist[0].name).toBe('Suresh Backup Cam');
    });

    it('returns null if event code does not exist', async () => {
      const query = `
        query GetEventDetail($eventCode: String!) {
          eventDetail(eventCode: $eventCode) {
            title
          }
        }
      `;

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          query,
          variables: { eventCode: 'EVT-999' },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.eventDetail).toBeNull();
    });
  });
});
