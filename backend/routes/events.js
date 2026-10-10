const express = require('express');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const Lead = require('../models/Lead');
const { auth, adminAuth } = require('../middleware/auth');
const { isValidPhone, formatPhone, escapeRegex } = require('../utils/validators');

const router = express.Router();

// Helpers for date and time calculations
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeOverlapping(startA, endA, startB, endB) {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);
  return Math.max(sA, sB) < Math.min(eA, eB);
}

function isSameCalendarDate(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

async function generateUniqueEventCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = 'EVT-';
    for (let i = 0; i < 3; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const exists = await Event.findOne({ eventCode: code });
    if (!exists) return code;
  }
  const crypto = require('crypto');
  return 'EVT-' + crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
}

// Helper to emit events to specific rooms
function emitSocket(req, eventName, payload, targetRoom = null) {
  const io = req?.app?.get ? req.app.get('io') : null;
  if (!io) return;
  const orgId = req.user?.organizationId;
  if (targetRoom && targetRoom !== 'admin') {
    io.to(targetRoom).emit(eventName, payload);
  } else if (orgId) {
    io.to(`admin:${orgId.toString()}`).emit(eventName, payload);
    io.to(`org:${orgId.toString()}`).emit(eventName, payload);
  } else {
    io.to('admin').emit(eventName, payload);
  }
}

// ─── REUSABLE AUTONOMOUS EVENT JOIN PIPELINE ─────────────────────────
async function joinEventByCode(user, eventCode, req = null) {
  if (!eventCode || typeof eventCode !== 'string') {
    return { status: 404, message: 'Invalid Event Code' };
  }

  const cleanCode = eventCode.trim().toUpperCase();
  const event = await Event.findOne({ eventCode: cleanCode });
  if (!event) {
    return { status: 404, message: 'Invalid Event Code' };
  }

  // Event status check
  if (event.status === 'cancelled' || event.status === 'completed') {
    return { status: 400, message: 'Cannot join an inactive or completed event' };
  }

  const userId = user._id || user.id;

  // Duplicate Check
  const existing = await Assignment.findOne({
    eventId: event._id,
    freelancerId: userId,
  });

  if (existing && ['assigned', 'accepted', 'waitlist'].includes(existing.status)) {
    return { status: 400, message: 'You are already registered for this event' };
  }

  // Schedule Conflict / Anti-Double-Booking Protection
  const activeAssignments = await Assignment.find({
    freelancerId: userId,
    status: { $in: ['assigned', 'accepted'] },
  }).populate('eventId');

  for (const asgn of activeAssignments) {
    const existingEvent = asgn.eventId;
    if (!existingEvent) continue;
    if (existingEvent._id.toString() === event._id.toString()) continue;
    if (existingEvent.status === 'cancelled') continue;

    if (isSameCalendarDate(existingEvent.date, event.date)) {
      if (isTimeOverlapping(event.startTime, event.endTime, existingEvent.startTime, existingEvent.endTime)) {
        return {
          status: 409,
          message: `Schedule Conflict: You are already booked for '${existingEvent.title}' on this date from ${existingEvent.startTime} to ${existingEvent.endTime}.`,
        };
      }
    }
  }

  // Capacity & Waitlist Logic
  const activeCount = await Assignment.countDocuments({
    eventId: event._id,
    status: { $in: ['assigned', 'accepted'] },
  });

  const isWaitlisted = activeCount >= event.requiredWorkers;
  const assignmentStatus = isWaitlisted ? 'waitlist' : 'assigned';
  const message = isWaitlisted
    ? 'Event slots are full. You have been added to the Priority Waitlist as a backup crew member.'
    : 'Joined event successfully! Shift confirmed.';
  const httpStatus = isWaitlisted ? 200 : 201;

  let assignment = existing;
  if (assignment) {
    assignment.status = assignmentStatus;
    assignment.joinedVia = 'event_code';
    assignment.eventCode = event.eventCode;
    assignment.eventTitle = event.title;
    assignment.eventDate = event.date;
    assignment.sessionPay = event.sessionPay || 0;
    assignment.updatedAt = new Date();
    await assignment.save();
  } else {
    assignment = new Assignment({
      organizationId: event.organizationId,
      eventId: event._id,
      freelancerId: userId,
      status: assignmentStatus,
      joinedVia: 'event_code',
      eventCode: event.eventCode,
      eventTitle: event.title,
      eventDate: event.date,
      sessionPay: event.sessionPay || 0,
    });
    await assignment.save();
  }

  if (req) {
    const io = req?.app?.get ? req.app.get('io') : null;
    const orgId = event.organizationId ? event.organizationId.toString() : null;
    const socketPayload = {
      event: {
        _id: event._id,
        uuid: event.uuid,
        title: event.title,
        eventCode: event.eventCode,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        requiredWorkers: event.requiredWorkers,
      },
      assignment,
      freelancer: { id: userId, name: user.name, email: user.email },
      isWaitlisted,
    };
    if (io) {
      if (orgId) {
        io.to(`admin:${orgId}`).emit('gig:joined', socketPayload);
        io.to(`org:${orgId}`).emit('gig:joined', socketPayload);
      }
      io.to('admin').emit('gig:joined', socketPayload);
    }
    emitSocket(req, isWaitlisted ? 'crewWaitlisted' : 'crewJoined', socketPayload);
  }

  return {
    status: httpStatus,
    data: {
      message,
      assignment,
      isWaitlisted,
    },
  };
}

// ─── 0. AUTONOMOUS EVENT JOIN (Freelancer) ───────────────────────────
router.post('/join', auth, async (req, res) => {
  try {
    const { eventCode } = req.body;
    if (!eventCode) {
      return res.status(404).json({ message: 'Invalid Event Code' });
    }
    const result = await joinEventByCode(req.user, eventCode, req);
    if (result.status >= 400) {
      return res.status(result.status).json({ message: result.message });
    }
    return res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 1. CREATE EVENT (Admin Only) ────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      leadId,
      clientName,
      clientPhone,
      date,
      startTime,
      endTime,
      location,
      requiredWorkers,
      sessionPay,
      overtimeRate,
      travelAllowance,
      assignmentMode,
      attendanceTracking,
      attendancePolicy,
      eventCode: customEventCode,
    } = req.body;

    // Validate location and geofence inputs
    if (!location || location.latitude === undefined || location.longitude === undefined || !location.address) {
      return res.status(400).json({ message: 'Valid location address, latitude, and longitude are required' });
    }

    if (!title || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'Title, date, startTime, and endTime are required' });
    }

    if (clientPhone && clientPhone.trim() !== '') {
      if (!isValidPhone(clientPhone)) {
        return res.status(400).json({ message: 'Please provide a valid client phone number (10 digits starting with 6-9, or valid international number)' });
      }
    }

    if (requiredWorkers !== undefined && Number(requiredWorkers) < 1) {
      return res.status(400).json({ message: 'Required workers count must be at least 1' });
    }

    if (sessionPay !== undefined && Number(sessionPay) < 0) {
      return res.status(400).json({ message: 'Session pay cannot be negative' });
    }

    if (overtimeRate !== undefined && Number(overtimeRate) < 0) {
      return res.status(400).json({ message: 'Overtime rate cannot be negative' });
    }

    if (travelAllowance !== undefined && Number(travelAllowance) < 0) {
      return res.status(400).json({ message: 'Travel allowance cannot be negative' });
    }

    const eventCode = customEventCode
      ? customEventCode.trim().toUpperCase()
      : await generateUniqueEventCode();

    const resolvedPolicy = attendancePolicy || (attendanceTracking === false ? 'none' : 'admin_managed');

    const event = new Event({
      organizationId: req.user.organizationId,
      eventCode,
      attendancePolicy: resolvedPolicy,
      attendanceTracking: resolvedPolicy !== 'none',
      title: title.trim(),
      description: description ? description.trim() : '',
      leadId: leadId || null,
      clientName: clientName ? clientName.trim() : '',
      clientPhone: clientPhone && isValidPhone(clientPhone) ? formatPhone(clientPhone) : '',
      date: new Date(date),
      startTime,
      endTime,
      location: {
        address: location.address,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        radius: location.radius ? Number(location.radius) : 150,
      },
      requiredWorkers: requiredWorkers ? Number(requiredWorkers) : 1,
      sessionPay: Number(sessionPay) || 0,
      overtimeRate: Number(overtimeRate) || 0,
      travelAllowance: Number(travelAllowance) || 0,
      assignmentMode: assignmentMode || 'direct',
      createdBy: req.user.id,
    });

    await event.save();

    // If linked to a lead, update lead status to 'converted' or log reference
    if (leadId) {
      await Lead.findByIdAndUpdate(leadId, {
        status: 'converted',
        $push: { notes: { text: `Event created: "${title}" for ${startTime} - ${endTime}` } },
      });
    }

    emitSocket(req, 'eventCreated', event);

    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. LIST EVENTS ──────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, search, mode, page = 1, limit = 20 } = req.query;
    let query = {};

    if (req.user.role === 'admin') {
      query.organizationId = req.user.organizationId;
    } else {
      // Freelancer sees:
      // 1. Events where they are assigned/applied/waitlisted across any studio
      // 2. Open upcoming events in their associated studio (if any)
      const myAssignments = await Assignment.find({
        freelancerId: req.user.id,
        status: { $in: ['assigned', 'applied', 'accepted', 'waitlist'] },
      }).select('eventId');

      const myEventIds = myAssignments.map((a) => a.eventId);
      const orClauses = [{ _id: { $in: myEventIds } }];
      if (req.user.organizationId) {
        orClauses.push({ organizationId: req.user.organizationId, assignmentMode: 'open', status: 'upcoming' });
      }
      query.$or = orClauses;
    }

    if (status) query.status = status;
    if (mode) query.assignmentMode = mode;
    if (search) {
      const safeSearch = escapeRegex(String(search).trim());
      const searchOr = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { clientName: { $regex: safeSearch, $options: 'i' } },
        { 'location.address': { $regex: safeSearch, $options: 'i' } },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      Event.find(query)
        .populate('leadId', 'name email phone')
        .sort({ date: 1, startTime: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Event.countDocuments(query),
    ]);

    // Compute assignment counts per event using database aggregation
    const eventIds = events.map((e) => e._id);
    const assignmentCountsAgg = await Assignment.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: { $in: ['assigned', 'accepted'] },
        },
      },
      {
        $group: {
          _id: '$eventId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countsMap = new Map(
      assignmentCountsAgg.map((item) => [item._id.toString(), item.count])
    );

    const eventsWithCounts = events.map((ev) => {
      const assignedCount = countsMap.get(ev._id.toString()) || 0;
      return {
        ...ev.toObject(),
        assignedCount,
        isFull: assignedCount >= ev.requiredWorkers,
      };
    });

    res.json({
      events: eventsWithCounts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 3. GET SINGLE EVENT ─────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('leadId', 'name email phone status');

    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (req.user.role === 'admin') {
      if (event.organizationId.toString() !== req.user.organizationId?.toString()) {
        return res.status(404).json({ message: 'Event not found' });
      }
    } else {
      const assignment = await Assignment.findOne({
        eventId: event._id,
        freelancerId: req.user.id,
      });
      const isMyOrgOpen = req.user.organizationId && event.organizationId.toString() === req.user.organizationId.toString() && event.assignmentMode === 'open';
      if (!assignment && !isMyOrgOpen) {
        return res.status(404).json({ message: 'Event not found' });
      }
    }

    // Fetch assignments for this event
    const assignments = await Assignment.find({ eventId: event._id })
      .populate('freelancerId', 'name email phone skills')
      .populate('assignedBy', 'name');

    const assignedCount = assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).length;

    res.json({
      event,
      assignments,
      assignedCount,
      isFull: assignedCount >= event.requiredWorkers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 4. UPDATE EVENT (Admin Only) ────────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot edit a cancelled event' });
    }

    if (req.body.clientPhone !== undefined) {
      if (req.body.clientPhone && req.body.clientPhone.trim() !== '') {
        if (!isValidPhone(req.body.clientPhone)) {
          return res.status(400).json({ message: 'Please provide a valid client phone number (10 digits starting with 6-9, or valid international number)' });
        }
        event.clientPhone = formatPhone(req.body.clientPhone);
      } else {
        event.clientPhone = '';
      }
    }

    if (req.body.requiredWorkers !== undefined) {
      if (Number(req.body.requiredWorkers) < 1) {
        return res.status(400).json({ message: 'Required workers count must be at least 1' });
      }
      event.requiredWorkers = Number(req.body.requiredWorkers);
    }

    if (req.body.sessionPay !== undefined) {
      if (Number(req.body.sessionPay) < 0) {
        return res.status(400).json({ message: 'Session pay cannot be negative' });
      }
      event.sessionPay = Number(req.body.sessionPay);
    }

    if (req.body.overtimeRate !== undefined) {
      if (Number(req.body.overtimeRate) < 0) {
        return res.status(400).json({ message: 'Overtime rate cannot be negative' });
      }
      event.overtimeRate = Number(req.body.overtimeRate);
    }

    if (req.body.travelAllowance !== undefined) {
      if (Number(req.body.travelAllowance) < 0) {
        return res.status(400).json({ message: 'Travel allowance cannot be negative' });
      }
      event.travelAllowance = Number(req.body.travelAllowance);
    }

    const simpleFields = [
      'title',
      'description',
      'date',
      'startTime',
      'endTime',
      'clientName',
      'assignmentMode',
      'status',
      'attendancePolicy',
    ];

    simpleFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    });

    if (req.body.attendancePolicy !== undefined) {
      event.attendanceTracking = req.body.attendancePolicy !== 'none';
    } else if (req.body.attendanceTracking !== undefined) {
      event.attendanceTracking = Boolean(req.body.attendanceTracking);
      if (!req.body.attendanceTracking) event.attendancePolicy = 'none';
    }

    if (req.body.location) {
      if (req.body.location.address) event.location.address = req.body.location.address;
      if (req.body.location.latitude) event.location.latitude = Number(req.body.location.latitude);
      if (req.body.location.longitude) event.location.longitude = Number(req.body.location.longitude);
      if (req.body.location.radius) event.location.radius = Number(req.body.location.radius);
    }

    event.updatedAt = Date.now();
    await event.save();

    emitSocket(req, 'eventUpdated', event);

    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 5. CANCEL EVENT (Admin Only) ────────────────────────────────────
router.patch('/:id/cancel', adminAuth, async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!event) return res.status(404).json({ message: 'Event not found' });

    event.status = 'cancelled';
    event.updatedAt = Date.now();
    await event.save();

    // Set all active assignments to cancelled
    await Assignment.updateMany(
      { eventId: event._id, status: { $in: ['assigned', 'applied', 'accepted'] } },
      { status: 'cancelled', updatedAt: Date.now() }
    );

    emitSocket(req, 'eventCancelled', { eventId: event._id });

    res.json({ message: 'Event and associated assignments cancelled successfully', event });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 6. DIRECT ASSIGN WORKER (Admin Only) ────────────────────────────
router.post('/:id/assign', adminAuth, async (req, res) => {
  try {
    const { freelancerId, notes } = req.body;
    if (!freelancerId) return res.status(400).json({ message: 'Freelancer ID is required' });

    const event = await Event.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot assign workers to a cancelled event' });
    }

    // Verify freelancer belongs to the same organization
    const freelancer = await User.findOne({
      _id: freelancerId,
      organizationId: req.user.organizationId,
    });
    if (!freelancer) {
      return res.status(404).json({ message: 'Freelancer not found in this organization' });
    }

    // Check capacity: count existing active assignments
    const currentAssignmentsCount = await Assignment.countDocuments({
      eventId: event._id,
      status: { $in: ['assigned', 'accepted'] },
    });

    if (currentAssignmentsCount >= event.requiredWorkers) {
      return res.status(400).json({
        message: `Event capacity reached (${currentAssignmentsCount}/${event.requiredWorkers} workers already assigned)`,
      });
    }

    // Check if worker already has an active assignment record for this event
    const existing = await Assignment.findOne({ eventId: event._id, freelancerId });
    if (existing) {
      if (['assigned', 'accepted'].includes(existing.status)) {
        return res.status(400).json({ message: 'Freelancer is already assigned to this event' });
      }
      // Re-activate if was previously cancelled, applied, or on waitlist
      const wasWaitlist = existing.status === 'waitlist';
      existing.status = 'assigned';
      existing.assignedBy = req.user.id;
      existing.notes = notes || existing.notes;
      existing.updatedAt = Date.now();
      await existing.save();

      emitSocket(req, 'assignmentCreated', existing, freelancerId.toString());
      if (wasWaitlist) {
        const io = req?.app?.get ? req.app.get('io') : null;
        if (io) {
          io.to(freelancerId.toString()).emit('waitlist:promoted', {
            eventId: event._id,
            eventCode: event.eventCode,
            eventTitle: event.title,
            assignment: existing,
          });
        }
      }
      return res.json(existing);
    }

    const assignment = new Assignment({
      organizationId: req.user.organizationId,
      eventId: event._id,
      freelancerId,
      status: 'assigned',
      joinedVia: 'direct_admin',
      eventCode: event.eventCode,
      eventTitle: event.title,
      eventDate: event.date,
      sessionPay: event.sessionPay || 0,
      assignedBy: req.user.id,
      notes: notes || '',
    });

    await assignment.save();

    // Real-time alert to the assigned freelancer
    emitSocket(req, 'assignmentCreated', assignment, freelancerId.toString());
    emitSocket(req, 'assignmentCreated', assignment, 'admin');

    res.status(201).json(assignment);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Freelancer is already assigned to this event' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── 7. REMOVE WORKER FROM EVENT (Admin Only) ────────────────────────
router.delete('/:id/assign/:freelancerId', adminAuth, async (req, res) => {
  try {
    const { id: eventId, freelancerId } = req.params;

    const assignment = await Assignment.findOne({
      eventId,
      freelancerId,
      organizationId: req.user.organizationId,
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Mark as cancelled rather than deleting so audit logs and history persist
    assignment.status = 'cancelled';
    assignment.updatedAt = Date.now();
    await assignment.save();

    emitSocket(req, 'assignmentCancelled', { eventId, freelancerId }, freelancerId);
    emitSocket(req, 'assignmentCancelled', { eventId, freelancerId }, 'admin');

    res.json({ message: 'Freelancer removed from event successfully', assignment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 8. APPLY FOR OPEN EVENT (Freelancer) ────────────────────────────
router.post('/:id/apply', auth, async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.assignmentMode !== 'open') {
      return res.status(400).json({ message: 'This event is not open for direct applications' });
    }
    if (event.status !== 'upcoming') {
      return res.status(400).json({ message: 'Applications are only accepted for upcoming events' });
    }

    // Capacity check
    const currentAssignmentsCount = await Assignment.countDocuments({
      eventId: event._id,
      status: { $in: ['assigned', 'accepted'] },
    });

    if (currentAssignmentsCount >= event.requiredWorkers) {
      return res.status(400).json({ message: 'Event is already fully staffed' });
    }

    const existing = await Assignment.findOne({
      eventId: event._id,
      freelancerId: req.user.id,
    });

    if (existing) {
      if (['assigned', 'accepted'].includes(existing.status)) {
        return res.status(400).json({ message: 'You are already assigned to this event' });
      }
      if (existing.status === 'applied') {
        return res.status(400).json({ message: 'You have already applied for this event' });
      }
      existing.status = 'applied';
      existing.appliedAt = new Date();
      existing.updatedAt = Date.now();
      await existing.save();

      emitSocket(req, 'applicationSubmitted', existing, 'admin');
      return res.json(existing);
    }

    const assignment = new Assignment({
      organizationId: req.user.organizationId,
      eventId: event._id,
      freelancerId: req.user.id,
      status: 'applied',
      joinedVia: 'open_apply',
      eventCode: event.eventCode,
      eventTitle: event.title,
      eventDate: event.date,
      sessionPay: event.sessionPay || 0,
      appliedAt: new Date(),
    });

    await assignment.save();

    emitSocket(req, 'applicationSubmitted', assignment, 'admin');

    res.status(201).json(assignment);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'You have already applied for this event' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── 9. REVIEW APPLICATION (Admin Only) ──────────────────────────────
router.patch('/:id/applications/:assignmentId/review', adminAuth, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'decline'
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ message: 'Action must be either "accept" or "decline"' });
    }

    const assignment = await Assignment.findOne({
      _id: req.params.assignmentId,
      eventId: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!assignment) return res.status(404).json({ message: 'Application not found' });

    const event = await Event.findById(assignment.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (action === 'accept') {
      // Re-verify capacity atomically before accepting
      const currentCount = await Assignment.countDocuments({
        eventId: event._id,
        status: { $in: ['assigned', 'accepted'] },
      });

      if (currentCount >= event.requiredWorkers) {
        return res.status(400).json({ message: 'Cannot accept application: Event slots are full' });
      }

      assignment.status = 'accepted';
      assignment.assignedBy = req.user.id;
    } else {
      assignment.status = 'declined';
    }

    assignment.respondedAt = new Date();
    assignment.updatedAt = Date.now();
    await assignment.save();

    emitSocket(req, 'applicationReviewed', assignment, assignment.freelancerId.toString());
    emitSocket(req, 'applicationReviewed', assignment, 'admin');

    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.joinEventByCode = joinEventByCode;
module.exports = router;
