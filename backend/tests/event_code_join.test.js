const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { app } = require('../server');

const User = require('../models/User');
const Organization = require('../models/Organization');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');

jest.setTimeout(30000);

describe('Phase 1: Event-Centric Architecture, UUID Migration & Autonomous Gig Joining', () => {
  let adminUser, adminToken;
  let organization;

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
    ]);

    // Create studio admin and organization
    adminUser = await User.create({
      name: 'Studio Master',
      email: 'master@studio.com',
      password: 'hashedpassword',
      role: 'admin',
    });

    organization = await Organization.create({
      name: 'Creative Lens Studio',
      ownerId: adminUser._id,
      studioCode: 'STU-LENS',
    });

    adminUser.organizationId = organization._id;
    await adminUser.save();

    adminToken = signUserToken(adminUser);
  });

  describe('1. 6-Character Event Code Generation & UUID Migration', () => {
    it('should generate a unique 6-character eventCode and UUID on event creation', async () => {
      const eventRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Royal Destination Wedding',
          date: '2026-11-20',
          startTime: '09:00',
          endTime: '18:00',
          location: {
            address: 'Palace Grounds, Jaipur',
            latitude: 26.9124,
            longitude: 75.7873,
            radius: 200,
          },
          requiredWorkers: 3,
          sessionPay: 6000,
          attendanceTracking: false,
        });

      expect(eventRes.status).toBe(201);
      expect(eventRes.body).toHaveProperty('uuid');
      expect(eventRes.body.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(eventRes.body).toHaveProperty('eventCode');
      expect(eventRes.body.eventCode).toMatch(/^EVT-[A-Z0-9]{3}$/);
      expect(eventRes.body.eventCode.length).toBe(7); // "EVT-" (4) + 3 alphanumeric = 7 chars
      expect(eventRes.body.attendanceTracking).toBe(false);
    });

    it('should allow custom eventCode if provided and unique', async () => {
      const customCode = 'EVT-999';
      const eventRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Fashion Gala Show',
          date: '2026-11-21',
          startTime: '16:00',
          endTime: '22:00',
          location: {
            address: 'Convention Center, Mumbai',
            latitude: 19.076,
            longitude: 72.8777,
          },
          eventCode: customCode,
          requiredWorkers: 2,
        });

      expect(eventRes.status).toBe(201);
      expect(eventRes.body.eventCode).toBe(customCode);
    });
  });

  describe('2. Independent Freelancer Registration (Studio Decoupling)', () => {
    it('should register an independent freelancer without studioCode or organizationId', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Vikram Drone Specialist',
          email: 'vikram.drone@gmail.com',
          password: 'securePassword123',
          role: 'freelancer',
          phone: '9876543210',
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body).toHaveProperty('token');
      expect(regRes.body.user).toHaveProperty('uuid');
      expect(regRes.body.user.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(regRes.body.user.role).toBe('freelancer');
      expect(regRes.body.user.organizationId).toBeNull();
      expect(regRes.body.user.organization).toBeNull();
    });

    it('should allow independent freelancer to log in cleanly without being forced into an organization', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Ananya Cinematographer',
          email: 'ananya.cinema@gmail.com',
          password: 'securePassword123',
          role: 'freelancer',
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ananya.cinema@gmail.com',
          password: 'securePassword123',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user).toHaveProperty('uuid');
      expect(loginRes.body.user.organizationId).toBeNull();
    });
  });

  describe('3. Autonomous Gig Joining via Event Code (POST /api/events/join)', () => {
    let testEvent, freelancer1, token1;

    beforeEach(async () => {
      // Create Event
      testEvent = await Event.create({
        organizationId: organization._id,
        title: 'Sunset Beach Pre-Wedding',
        date: new Date('2026-12-05T00:00:00.000Z'),
        startTime: '15:00',
        endTime: '19:00',
        location: {
          address: 'Baga Beach, Goa',
          latitude: 15.5553,
          longitude: 73.7517,
        },
        requiredWorkers: 2,
        sessionPay: 4500,
        createdBy: adminUser._id,
      });

      // Create Independent Freelancer 1
      freelancer1 = await User.create({
        name: 'Kabir Light Technician',
        email: 'kabir.lights@gmail.com',
        password: 'password123',
        role: 'freelancer',
        organizationId: null,
      });
      token1 = signUserToken(freelancer1);
    });

    it('should successfully join an event when capacity is available (201 Created)', async () => {
      const joinRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token1}`)
        .send({ eventCode: testEvent.eventCode });

      expect(joinRes.status).toBe(201);
      expect(joinRes.body.isWaitlisted).toBe(false);
      expect(joinRes.body.message).toBe('Joined event successfully! Shift confirmed.');
      expect(joinRes.body.assignment).toBeDefined();
      expect(joinRes.body.assignment.status).toBe('assigned');
      expect(joinRes.body.assignment.joinedVia).toBe('event_code');
      expect(joinRes.body.assignment.uuid).toBeDefined();

      // Verify denormalized snapshot fields
      expect(joinRes.body.assignment.eventCode).toBe(testEvent.eventCode);
      expect(joinRes.body.assignment.eventTitle).toBe('Sunset Beach Pre-Wedding');
      expect(joinRes.body.assignment.sessionPay).toBe(4500);
    });

    it('should reject joining with 404 if event code does not exist', async () => {
      const joinRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token1}`)
        .send({ eventCode: 'NON-EXISTENT' });

      expect(joinRes.status).toBe(404);
      expect(joinRes.body.message).toBe('Invalid Event Code');
    });

    it('should reject joining with 400 if event is cancelled or completed', async () => {
      testEvent.status = 'cancelled';
      await testEvent.save();

      const joinRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token1}`)
        .send({ eventCode: testEvent.eventCode });

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.message).toBe('Cannot join an inactive or completed event');
    });

    it('should prevent duplicate registration with 400 Bad Request', async () => {
      // First join
      await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token1}`)
        .send({ eventCode: testEvent.eventCode });

      // Second join attempt by the same freelancer
      const dupRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token1}`)
        .send({ eventCode: testEvent.eventCode });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.message).toBe('You are already registered for this event');
    });

    it('should automatically assign to Priority Waitlist when capacity is exceeded (200 OK)', async () => {
      // Event capacity is 2.
      // Fill slot 1 with freelancer1
      await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token1}`)
        .send({ eventCode: testEvent.eventCode });

      // Fill slot 2 with freelancer2
      const freelancer2 = await User.create({
        name: 'Rohan Gimbal Operator',
        email: 'rohan.gimbal@gmail.com',
        password: 'password123',
        role: 'freelancer',
      });
      const token2 = signUserToken(freelancer2);

      const join2Res = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token2}`)
        .send({ eventCode: testEvent.eventCode });

      expect(join2Res.status).toBe(201);
      expect(join2Res.body.isWaitlisted).toBe(false);

      // Freelancer 3 applies when slots are full (active count = 2 >= requiredWorkers = 2)
      const freelancer3 = await User.create({
        name: 'Deepak Backup Drone',
        email: 'deepak.drone@gmail.com',
        password: 'password123',
        role: 'freelancer',
      });
      const token3 = signUserToken(freelancer3);

      const join3Res = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token3}`)
        .send({ eventCode: testEvent.eventCode });

      expect(join3Res.status).toBe(200);
      expect(join3Res.body.isWaitlisted).toBe(true);
      expect(join3Res.body.message).toBe(
        'Event slots are full. You have been added to the Priority Waitlist as a backup crew member.'
      );
      expect(join3Res.body.assignment.status).toBe('waitlist');
      expect(join3Res.body.assignment.joinedVia).toBe('event_code');
    });
  });

  describe('4. Schedule Conflict & Anti-Double-Booking Protection', () => {
    let eventMorning, eventOverlapping, freelancer, token;

    beforeEach(async () => {
      // Freelancer
      freelancer = await User.create({
        name: 'Karthik Master Photographer',
        email: 'karthik.photo@gmail.com',
        password: 'password123',
        role: 'freelancer',
      });
      token = signUserToken(freelancer);

      // Event 1: Morning to Afternoon (10:00 - 16:00) on 2026-12-10
      eventMorning = await Event.create({
        organizationId: organization._id,
        title: 'Morning Haldi Ceremony',
        date: new Date('2026-12-10T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '16:00',
        location: {
          address: 'Heritage Resort, Udaipur',
          latitude: 24.5854,
          longitude: 73.7125,
        },
        requiredWorkers: 2,
        createdBy: adminUser._id,
      });

      // Event 2: Overlapping Afternoon (14:00 - 20:00) on SAME DATE 2026-12-10
      eventOverlapping = await Event.create({
        organizationId: organization._id,
        title: 'Afternoon Poolside Sangeet',
        date: new Date('2026-12-10T00:00:00.000Z'),
        startTime: '14:00',
        endTime: '20:00',
        location: {
          address: 'Lake Palace, Udaipur',
          latitude: 24.5764,
          longitude: 73.6805,
        },
        requiredWorkers: 2,
        createdBy: adminUser._id,
      });

      // Join Morning Event first
      await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventCode: eventMorning.eventCode });
    });

    it('should reject joining with 409 Conflict if freelancer is already booked for an overlapping time on the same date', async () => {
      const conflictRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventCode: eventOverlapping.eventCode });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.message).toBe(
        "Schedule Conflict: You are already booked for 'Morning Haldi Ceremony' on this date from 10:00 to 16:00."
      );
    });

    it('should allow joining an event on the same date if the shift time does not overlap', async () => {
      // Event 3: Evening Reception (17:00 - 23:00) on 2026-12-10 (After 16:00)
      const eventEvening = await Event.create({
        organizationId: organization._id,
        title: 'Night Grand Reception',
        date: new Date('2026-12-10T00:00:00.000Z'),
        startTime: '17:00',
        endTime: '23:00',
        location: {
          address: 'City Palace, Udaipur',
          latitude: 24.5764,
          longitude: 73.6805,
        },
        requiredWorkers: 2,
        createdBy: adminUser._id,
      });

      const eveningRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventCode: eventEvening.eventCode });

      expect(eveningRes.status).toBe(201);
      expect(eveningRes.body.isWaitlisted).toBe(false);
      expect(eveningRes.body.message).toBe('Joined event successfully! Shift confirmed.');
    });

    it('should allow joining an event with overlapping hours on a DIFFERENT calendar date', async () => {
      // Event 4: Same hours (10:00 - 16:00) but on 2026-12-11
      const eventNextDay = await Event.create({
        organizationId: organization._id,
        title: 'Next Day Post-Wedding Shoot',
        date: new Date('2026-12-11T00:00:00.000Z'),
        startTime: '10:00',
        endTime: '16:00',
        location: {
          address: 'Heritage Resort, Udaipur',
          latitude: 24.5854,
          longitude: 73.7125,
        },
        requiredWorkers: 2,
        createdBy: adminUser._id,
      });

      const nextDayRes = await request(app)
        .post('/api/events/join')
        .set('Authorization', `Bearer ${token}`)
        .send({ eventCode: eventNextDay.eventCode });

      expect(nextDayRes.status).toBe(201);
      expect(nextDayRes.body.isWaitlisted).toBe(false);
    });
  });

  describe('5. Freelancer Registration with Event Code Auto-Join', () => {
    it('should register user and automatically join event when eventCode is supplied during registration', async () => {
      const gigEvent = await Event.create({
        organizationId: organization._id,
        title: 'Tech Summit Keynote Coverage',
        date: new Date('2026-12-25T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '14:00',
        location: {
          address: 'HICC Novotel, Hyderabad',
          latitude: 17.4727,
          longitude: 78.3728,
        },
        requiredWorkers: 4,
        sessionPay: 5000,
        createdBy: adminUser._id,
      });

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Suresh Sound Engineer',
          email: 'suresh.sound@gmail.com',
          password: 'password123',
          role: 'freelancer',
          eventCode: gigEvent.eventCode,
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body).toHaveProperty('token');
      expect(regRes.body.user).toHaveProperty('uuid');
      expect(regRes.body).toHaveProperty('assignment');
      expect(regRes.body.isWaitlisted).toBe(false);
      expect(regRes.body.assignment.status).toBe('assigned');
      expect(regRes.body.assignment.eventCode).toBe(gigEvent.eventCode);
      expect(regRes.body.assignment.eventTitle).toBe('Tech Summit Keynote Coverage');
    });

    it('should reject registration if supplied eventCode is invalid', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Unknown Operator',
          email: 'unknown.op@gmail.com',
          password: 'password123',
          role: 'freelancer',
          eventCode: 'INVALID-CODE',
        });

      expect(regRes.status).toBe(404);
      expect(regRes.body.message).toBe('Invalid Event Code');
    });
  });
});
