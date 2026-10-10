const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const AttendanceRequest = require('../models/AttendanceRequest');
const Payout = require('../models/Payout');
const Lead = require('../models/Lead');

const resolvers = {
  // ─── 1. CONSOLIDATED FREELANCER DASHBOARD RESOLVER ──────────────────
  freelancerDashboard: async (args, context) => {
    if (!context?.user) {
      throw new Error('Authentication required');
    }

    const userId = context.user.id;
    const userObjId = new mongoose.Types.ObjectId(userId);

    // Run parallel database queries for instant 1-RTT aggregation
    const [userDoc, assignments, openEvents, activeAtt, paidAgg, pendingAgg, requests] =
      await Promise.all([
        User.findById(userId).select('name email phone role organizationId'),

        Assignment.find({
          freelancerId: userObjId,
          status: { $in: ['assigned', 'accepted', 'waitlist'] },
        })
          .populate('eventId')
          .sort({ eventDate: 1 }),

        Event.find({
          assignmentMode: 'open',
          status: { $in: ['upcoming', 'active'] },
        })
          .sort({ date: 1 })
          .limit(10),

        Attendance.findOne({
          freelancerId: userObjId,
          status: { $in: ['checked_in', 'manual_review'] },
        })
          .populate('eventId', 'title')
          .sort({ checkInAt: -1 }),

        Payout.aggregate([
          { $match: { freelancerId: userObjId, status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        ]),

        Payout.aggregate([
          { $match: { freelancerId: userObjId, status: { $in: ['pending', 'approved'] } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        ]),

        AttendanceRequest.find({ freelancerId: userObjId })
          .populate('eventId', 'title')
          .sort({ createdAt: -1 })
          .limit(5),
      ]);

    if (!userDoc) {
      throw new Error('User not found');
    }

    let organizationName = null;
    let studioCode = null;
    if (userDoc.organizationId) {
      const org = await Organization.findById(userDoc.organizationId).select('name studioCode');
      if (org) {
        organizationName = org.name;
        studioCode = org.studioCode;
      }
    }

    // Format Assigned Gigs
    const assignedGigs = assignments
      .filter((as) => as.eventId && as.eventId.status !== 'cancelled')
      .map((as) => {
        const ev = as.eventId;
        return {
          id: as._id.toString(),
          uuid: ev.uuid || as.uuid || '',
          title: ev.title || as.eventTitle || 'Untitled Event',
          eventCode: ev.eventCode || as.eventCode || '',
          date: ev.date ? new Date(ev.date).toISOString() : new Date().toISOString(),
          startTime: ev.startTime || '09:00',
          endTime: ev.endTime || '17:00',
          address: ev.location?.address || 'Venue TBD',
          sessionPay: Number(as.sessionPay ?? ev.sessionPay ?? 0),
          status: as.status, // 'assigned' | 'accepted' | 'waitlist'
          attendanceTracking: ev.attendanceTracking !== false,
          attendancePolicy: ev.attendancePolicy || (ev.attendanceTracking === false ? 'none' : 'admin_managed'),
          assignmentMode: ev.assignmentMode || 'direct',
        };
      });

    // Format Open Gigs (Shifts available for application)
    const openGigs = openEvents.map((ev) => ({
      id: ev._id.toString(),
      uuid: ev.uuid || '',
      title: ev.title || 'Open Shift',
      eventCode: ev.eventCode || '',
      date: ev.date ? new Date(ev.date).toISOString() : new Date().toISOString(),
      startTime: ev.startTime || '09:00',
      endTime: ev.endTime || '17:00',
      address: ev.location?.address || 'Venue TBD',
      sessionPay: Number(ev.sessionPay || 0),
      status: 'open',
      attendanceTracking: ev.attendanceTracking !== false,
      attendancePolicy: ev.attendancePolicy || (ev.attendanceTracking === false ? 'none' : 'admin_managed'),
      assignmentMode: 'open',
    }));

    // Format Active Attendance (if currently checked in)
    let activeAttendance = null;
    if (activeAtt) {
      activeAttendance = {
        id: activeAtt._id.toString(),
        eventId: activeAtt.eventId?._id ? activeAtt.eventId._id.toString() : activeAtt.eventId.toString(),
        eventTitle: activeAtt.eventId?.title || 'Active Shift',
        checkInAt: activeAtt.checkInAt ? new Date(activeAtt.checkInAt).toISOString() : null,
        checkOutAt: activeAtt.checkOutAt ? new Date(activeAtt.checkOutAt).toISOString() : null,
        status: activeAtt.status,
        isExtended: Boolean(activeAtt.isExtended),
        actualMinutes: Number(activeAtt.actualMinutes || 0),
        overtimeMinutes: Number(activeAtt.overtimeMinutes || 0),
        overtimeStatus: activeAtt.overtimeStatus || 'none',
      };
    }

    // Format Earnings
    const earnings = {
      totalPaid: Number(paidAgg[0]?.total || 0),
      pendingEarnings: Number(pendingAgg[0]?.total || 0),
      completedGigsCount: Number(paidAgg[0]?.count || 0),
      pendingGigsCount: Number(pendingAgg[0]?.count || 0),
    };

    // Format Pending Requests
    const pendingRequests = requests.map((req) => ({
      id: req._id.toString(),
      eventId: req.eventId?._id ? req.eventId._id.toString() : req.eventId.toString(),
      eventTitle: req.eventId?.title || 'Event',
      requestType: req.requestType || 'correction',
      status: req.status || 'pending',
      reason: req.reason || '',
      createdAt: req.createdAt ? new Date(req.createdAt).toISOString() : new Date().toISOString(),
    }));

    return {
      user: {
        id: userDoc._id.toString(),
        name: userDoc.name,
        email: userDoc.email,
        phone: userDoc.phone || null,
        role: userDoc.role,
        organizationId: userDoc.organizationId ? userDoc.organizationId.toString() : null,
        organizationName,
        studioCode,
      },
      assignedGigs,
      openGigs,
      activeAttendance,
      earnings,
      pendingRequests,
    };
  },

  // ─── 2. CONSOLIDATED ADMIN DASHBOARD RESOLVER ───────────────────────
  adminDashboard: async (args, context) => {
    if (!context?.user) {
      throw new Error('Authentication required');
    }
    if (context.user.role !== 'admin') {
      throw new Error('Access denied: Admin role required');
    }

    const orgId = context.user.organizationId;
    if (!orgId) {
      throw new Error('Admin organization not found');
    }
    const orgObjId = new mongoose.Types.ObjectId(orgId);

    // Parallel Aggregations
    const [
      userDoc,
      orgDoc,
      events,
      totalEventsCount,
      activeEventsCount,
      totalWorkersCount,
      pendingOtCount,
      pendingPayoutsAgg,
      recentAttendanceDocs,
      recentLeadDocs,
    ] = await Promise.all([
      User.findById(context.user.id).select('name email phone role organizationId'),
      Organization.findById(orgId).select('name studioCode'),
      Event.find({ organizationId: orgObjId }).sort({ date: 1, startTime: 1 }).limit(10),
      Event.countDocuments({ organizationId: orgObjId }),
      Event.countDocuments({ organizationId: orgObjId, status: { $in: ['upcoming', 'active'] } }),
      User.countDocuments({ organizationId: orgObjId, role: 'freelancer' }),
      Attendance.countDocuments({ organizationId: orgObjId, overtimeStatus: 'pending' }),
      Payout.aggregate([
        { $match: { organizationId: orgObjId, status: { $in: ['pending', 'approved'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Attendance.find({ organizationId: orgObjId })
        .populate('eventId', 'title')
        .populate('freelancerId', 'name')
        .sort({ checkInAt: -1 })
        .limit(8),
      Lead.find({ organizationId: orgObjId }).sort({ createdAt: -1 }).limit(5),
    ]);

    // Compute crew assignments for each upcoming event
    const eventIds = events.map((e) => e._id);
    const assignments = await Assignment.find({
      eventId: { $in: eventIds },
      status: { $in: ['assigned', 'accepted', 'waitlist'] },
    }).select('eventId status');

    const confirmedCountByEvent = {};
    const waitlistedCountByEvent = {};
    assignments.forEach((as) => {
      const eId = as.eventId.toString();
      if (['assigned', 'accepted'].includes(as.status)) {
        confirmedCountByEvent[eId] = (confirmedCountByEvent[eId] || 0) + 1;
      } else if (as.status === 'waitlist') {
        waitlistedCountByEvent[eId] = (waitlistedCountByEvent[eId] || 0) + 1;
      }
    });

    const upcomingEvents = events.map((ev) => {
      const eId = ev._id.toString();
      return {
        id: eId,
        uuid: ev.uuid || '',
        title: ev.title || 'Untitled Event',
        eventCode: ev.eventCode || '',
        date: ev.date ? new Date(ev.date).toISOString() : new Date().toISOString(),
        startTime: ev.startTime || '09:00',
        endTime: ev.endTime || '17:00',
        address: ev.location?.address || 'Venue TBD',
        status: ev.status,
        attendanceTracking: ev.attendanceTracking !== false,
        attendancePolicy: ev.attendancePolicy || (ev.attendanceTracking === false ? 'none' : 'admin_managed'),
        requiredWorkers: Number(ev.requiredWorkers || 1),
        confirmedWorkersCount: Number(confirmedCountByEvent[eId] || 0),
        waitlistedWorkersCount: Number(waitlistedCountByEvent[eId] || 0),
        sessionPay: Number(ev.sessionPay || 0),
      };
    });

    const recentAttendance = recentAttendanceDocs.map((att) => ({
      id: att._id.toString(),
      eventId: att.eventId?._id ? att.eventId._id.toString() : null,
      eventTitle: att.eventId?.title || 'Event Shift',
      workerName: att.freelancerId?.name || 'Freelancer',
      checkInAt: att.checkInAt ? new Date(att.checkInAt).toISOString() : null,
      status: att.status,
      overtimeStatus: att.overtimeStatus || 'none',
    }));

    const recentLeads = recentLeadDocs.map((lead) => ({
      id: lead._id.toString(),
      name: lead.name,
      phone: lead.phone || null,
      email: lead.email,
      status: lead.status || 'new',
      source: lead.source || 'Direct',
      createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString() : null,
    }));

    return {
      user: {
        id: userDoc?._id.toString() || context.user.id,
        name: userDoc?.name || 'Studio Admin',
        email: userDoc?.email || '',
        phone: userDoc?.phone || null,
        role: 'admin',
        organizationId: orgId.toString(),
        organizationName: orgDoc?.name || 'Studio CRM',
        studioCode: orgDoc?.studioCode || null,
      },
      kpi: {
        totalEvents: totalEventsCount,
        activeEvents: activeEventsCount,
        totalWorkers: totalWorkersCount,
        pendingOvertimeCount: pendingOtCount,
        pendingPayoutTotal: Number(pendingPayoutsAgg[0]?.total || 0),
      },
      upcomingEvents,
      recentAttendance,
      recentLeads,
    };
  },

  // ─── 3. SINGLE EVENT DETAIL WITH LIVE ROSTER & WAITLIST ─────────────
  eventDetail: async ({ eventCode }, context) => {
    if (!context?.user) {
      throw new Error('Authentication required');
    }

    if (!eventCode) {
      throw new Error('Event code is required');
    }

    const cleanCode = eventCode.trim().toUpperCase();
    const event = await Event.findOne({ eventCode: cleanCode });
    if (!event) {
      return null;
    }

    const assignments = await Assignment.find({
      eventId: event._id,
      status: { $in: ['assigned', 'accepted', 'waitlist', 'applied'] },
    }).populate('freelancerId', 'name email phone');

    const confirmedCrew = [];
    const waitlist = [];
    const applications = [];

    assignments.forEach((as) => {
      const workerSummary = {
        id: as.freelancerId?._id ? as.freelancerId._id.toString() : as.freelancerId?.toString() || as._id.toString(),
        assignmentId: as._id.toString(),
        name: as.freelancerId?.name || 'Freelancer',
        email: as.freelancerId?.email || '',
        phone: as.freelancerId?.phone || null,
        status: as.status,
        joinedVia: as.joinedVia || 'direct_admin',
      };

      if (['assigned', 'accepted'].includes(as.status)) {
        confirmedCrew.push(workerSummary);
      } else if (as.status === 'waitlist') {
        waitlist.push(workerSummary);
      } else if (as.status === 'applied') {
        applications.push(workerSummary);
      }
    });

    return {
      id: event._id.toString(),
      uuid: event.uuid || '',
      title: event.title,
      eventCode: event.eventCode,
      date: event.date ? new Date(event.date).toISOString() : new Date().toISOString(),
      startTime: event.startTime || '09:00',
      endTime: event.endTime || '17:00',
      address: event.location?.address || 'Venue TBD',
      latitude: event.location?.latitude != null ? Number(event.location.latitude) : null,
      longitude: event.location?.longitude != null ? Number(event.location.longitude) : null,
      radius: event.location?.radius != null ? Number(event.location.radius) : 150,
      attendanceTracking: event.attendanceTracking !== false,
      attendancePolicy: event.attendancePolicy || (event.attendanceTracking === false ? 'none' : 'admin_managed'),
      requiredWorkers: Number(event.requiredWorkers || 1),
      sessionPay: Number(event.sessionPay || 0),
      overtimeRate: Number(event.overtimeRate || 0),
      travelAllowance: Number(event.travelAllowance || 0),
      status: event.status,
      confirmedCrew,
      waitlist,
      applications,
    };
  },
};

module.exports = resolvers;
