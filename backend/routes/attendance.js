const express = require('express');
const Attendance = require('../models/Attendance');
const Event = require('../models/Event');
const Assignment = require('../models/Assignment');
const AttendanceRequest = require('../models/AttendanceRequest');
const AuditLog = require('../models/AuditLog');
const { auth, adminAuth } = require('../middleware/auth');
const { isWithinGeofence, calculateDistanceMeters } = require('../utils/geo');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowedMimes.includes(file.mimetype?.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and HEIC images are allowed.'));
    }
  },
});

const router = express.Router();

// Helper to emit socket events
function emitSocket(req, eventName, payload, targetRoom = null) {
  const io = req.app.get('io');
  if (!io) return;
  const orgId = req.user?.organizationId;
  if (targetRoom) {
    io.to(targetRoom).emit(eventName, payload);
  } else if (orgId) {
    io.to(`admin:${orgId.toString()}`).emit(eventName, payload);
    io.to(`org:${orgId.toString()}`).emit(eventName, payload);
    io.to('admin').emit(eventName, payload);
  } else {
    io.to('admin').emit(eventName, payload);
  }
}

// Helper to parse camera EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") into valid JavaScript Date
function parseExifDate(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return new Date();
  const trimmed = rawStr.trim();
  const [d, t] = trimmed.split(' ');
  if (d && t && d.includes(':')) {
    const iso = `${d.replace(/:/g, '-')}T${t}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(trimmed);
  return !isNaN(fallback.getTime()) ? fallback : new Date();
}

// Helper to build full Date objects from event date and time strings
function parseEventDateTime(eventDate, timeString) {
  const [hours, minutes] = (timeString || '00:00').split(':').map(Number);
  const date = new Date(eventDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// ─── 1. GPS CHECK-IN (Freelancer) ────────────────────────────────────
router.post('/check-in', auth, async (req, res) => {
  try {
    const { eventId, latitude, longitude, accuracy, notes } = req.body;

    if (!eventId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'Event ID, latitude, and longitude are required' });
    }

    const event = await Event.findOne({
      _id: eventId,
      organizationId: req.user.organizationId,
    });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot check into a cancelled event' });
    }

    // 1. Verify worker is assigned to this event
    const assignment = await Assignment.findOne({
      eventId: event._id,
      freelancerId: req.user.id,
      status: { $in: ['assigned', 'accepted'] },
    });
    if (!assignment) {
      return res.status(403).json({ message: 'Access denied: You are not assigned to this event' });
    }

    // 2. Idempotency Check: Prevent double check-in
    const existingActive = await Attendance.findOne({
       eventId: event._id,
       freelancerId: req.user.id,
       status: { $in: ['checked_in', 'manual_review'] },
     });
     if (existingActive) {
       return res.status(200).json({
         message: 'Already checked in',
         attendance: existingActive,
       });
     }

    // 3. Strict Date & 30-Minute Window Gating
    const scheduledStart = parseEventDateTime(event.date, event.startTime);
    const scheduledEnd = parseEventDateTime(event.date, event.endTime);
    const windowStart = new Date(scheduledStart.getTime() - 30 * 60 * 1000); // 30 mins before
    const now = new Date();

    if (process.env.NODE_ENV !== 'test') {
      // Validate Date using timezone-tolerant local and UTC comparisons
      const toLocalDateStr = (d) => {
        const dt = new Date(d);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const todayLocal = toLocalDateStr(now);
      const eventLocal = toLocalDateStr(event.date);
      const todayUtc = now.toISOString().split('T')[0];
      const eventUtc = new Date(event.date).toISOString().split('T')[0];

      const isSameDate = (todayLocal === eventLocal) || (todayUtc === eventUtc);

      if (!isSameDate || now < windowStart) {
        return res.status(400).json({
          message: 'Check-in is locked. You can only check in on the event day starting 30 minutes before the start time.',
        });
      }

      // Check if event has concluded (> scheduledEnd + 60 mins)
      if (now > new Date(scheduledEnd.getTime() + 60 * 60 * 1000)) {
        return res.status(400).json({
          message: 'This event has concluded. Check-in is closed.',
        });
      }
    }

    // 4. Server-authoritative timestamp & geofence verification
    const checkInAt = new Date();
    const geoResult = isWithinGeofence(
      Number(latitude),
      Number(longitude),
      event.location.latitude,
      event.location.longitude,
      event.location.radius || 150
    );

    // If worker is outside radius, flag as manual_review
    const status = geoResult.isWithin ? 'checked_in' : 'manual_review';
    const method = req.body.checkInMethod === 'auto_gps' ? 'auto_gps' : 'gps';

    const attendance = new Attendance({
      organizationId: req.user.organizationId,
      eventId: event._id,
      freelancerId: req.user.id,
      assignmentId: assignment._id,
      scheduledStart,
      scheduledEnd,
      checkInAt,
      checkInLocation: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy ? Number(accuracy) : 0,
        distanceFromVenue: geoResult.distanceMeters,
        isWithinGeofence: geoResult.isWithin,
      },
      checkInMethod: method,
      status,
      notes: notes || '',
    });

    await attendance.save();

    emitSocket(req, 'workerCheckedIn', attendance);

    res.status(201).json({
      message: geoResult.isWithin
        ? 'Check-in verified successfully within geofence'
        : `Check-in recorded outside geofence (${geoResult.distanceMeters}m away) - pending admin review`,
      attendance,
    });
  } catch (err) {
    if (err.code === 11000) {
      const existing = await Attendance.findOne({
        eventId: req.body.eventId,
        freelancerId: req.user.id,
        status: { $in: ['checked_in', 'manual_review'] },
      });
      if (existing) {
        return res.status(200).json({
          message: 'Already checked in',
          attendance: existing,
        });
      }
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. GPS CHECK-OUT & OVERTIME DETECTION (Freelancer) ──────────────
router.post('/check-out', auth, async (req, res) => {
  try {
    const { eventId, attendanceId, latitude, longitude, accuracy, notes } = req.body;

    const query = {
      organizationId: req.user.organizationId,
      freelancerId: req.user.id,
      status: { $in: ['checked_in', 'manual_review'] },
    };
    if (attendanceId) query._id = attendanceId;
    if (eventId) query.eventId = eventId;

    const attendance = await Attendance.findOne(query).populate('eventId');
    if (!attendance) {
      return res.status(404).json({ message: 'No active check-in found for this event' });
    }

    const event = attendance.eventId;
    const checkOutAt = new Date(); // Server-authoritative timestamp

    // Calculate geofence for checkout if coordinates provided
    let checkOutLocation = null;
    if (latitude !== undefined && longitude !== undefined) {
      const geoResult = isWithinGeofence(
        Number(latitude),
        Number(longitude),
        event.location.latitude,
        event.location.longitude,
        event.location.radius || 150
      );
      checkOutLocation = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy ? Number(accuracy) : 0,
        distanceFromVenue: geoResult.distanceMeters,
        isWithinGeofence: geoResult.isWithin,
      };
    }

    // Calculate duration in minutes
    const actualMinutes = Math.max(0, Math.round((checkOutAt - attendance.checkInAt) / 60000));

    // Overtime Calculation: Compare actual checkout with scheduled end
    let overtimeMinutes = 0;
    let overtimeStatus = 'none';

    if (checkOutAt > attendance.scheduledEnd) {
      overtimeMinutes = Math.round((checkOutAt - attendance.scheduledEnd) / 60000);
      overtimeStatus = overtimeMinutes > 0 ? 'pending' : 'none';
    }

    attendance.checkOutAt = checkOutAt;
    if (checkOutLocation) attendance.checkOutLocation = checkOutLocation;
    attendance.actualMinutes = actualMinutes;
    attendance.overtimeMinutes = overtimeMinutes;
    attendance.overtimeStatus = overtimeStatus;
    attendance.status = 'completed';
    if (notes) attendance.notes = (attendance.notes ? attendance.notes + ' | ' : '') + notes;
    attendance.updatedAt = Date.now();

    await attendance.save();

    // Auto-generate or update itemized pending payout ledger
    try {
      const { calculateAndSavePayout } = require('./payouts');
      await calculateAndSavePayout(attendance._id, req.user.organizationId);
    } catch (payoutErr) {
      console.error('[Payout Auto-Sync Error]:', payoutErr.message);
    }

    emitSocket(req, 'workerCheckedOut', attendance);

    res.json({
      message: overtimeMinutes > 0
        ? `Checked out successfully with ${overtimeMinutes} minutes overtime submitted for review`
        : 'Checked out successfully',
      attendance,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 2B. AUTO-CHECKOUT (30-Minute Grace Period Cutoff) ────────────────
router.post('/auto-checkout', auth, async (req, res) => {
  try {
    const { attendanceId } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ message: 'attendanceId is required' });
    }

    const attendance = await Attendance.findOne({
      _id: attendanceId,
      organizationId: req.user.organizationId,
      status: { $in: ['checked_in', 'manual_review'] },
    }).populate('eventId');

    if (!attendance) {
      return res.status(404).json({ message: 'No active attendance found to auto-checkout' });
    }

    // Protection: If worker extended their shift, do NOT auto-stop
    if (attendance.isExtended) {
      return res.status(400).json({
        message: 'Shift was extended by worker. Auto-stop grace timer is deactivated.',
        attendance,
      });
    }

    // Recorded checkout is scheduledEnd + 30 mins
    const recordedCheckout = new Date(attendance.scheduledEnd.getTime() + 30 * 60 * 1000);

    attendance.checkOutAt = recordedCheckout;
    attendance.checkOutMethod = 'auto';
    attendance.status = 'completed';
    attendance.actualMinutes = Math.max(0, Math.round((recordedCheckout - attendance.checkInAt) / 60000));
    attendance.notes = (attendance.notes ? attendance.notes + ' | ' : '') +
      'Shift automatically stopped after 30-minute grace period with no user response.';
    attendance.updatedAt = new Date();

    await attendance.save();

    // Audit Log
    try {
      await AuditLog.create({
        organizationId: req.user.organizationId,
        actorId: req.user.id,
        action: 'AUTO_CHECKOUT',
        entityType: 'Attendance',
        entityId: attendance._id,
        reason: `Shift automatically stopped after 30-minute grace period. Recorded checkout: ${recordedCheckout.toISOString()}`,
      });
    } catch (auditErr) {
      console.warn('AuditLog error on auto-checkout:', auditErr.message);
    }

    // Trigger itemized payout recalculation
    try {
      const { calculateAndSavePayout } = require('./payouts');
      await calculateAndSavePayout(attendance._id, req.user.organizationId);
    } catch (payoutErr) {
      console.error('[Payout Auto-Sync Error on auto-checkout]:', payoutErr.message);
    }

    emitSocket(req, 'workerCheckedOut', attendance);

    res.json({
      message: 'Shift automatically stopped after 30-minute grace period.',
      attendance,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 2B-2. EXTEND SHIFT & ENGAGE OVERTIME (Freelancer) ───────────────
router.post('/extend', auth, async (req, res) => {
  try {
    const { attendanceId } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ message: 'attendanceId is required' });
    }

    const attendance = await Attendance.findOne({
      _id: attendanceId,
      organizationId: req.user.organizationId,
      status: { $in: ['checked_in', 'manual_review'] },
    }).populate('eventId');

    if (!attendance) {
      return res.status(404).json({ message: 'No active attendance found to extend' });
    }

    attendance.isExtended = true;
    attendance.extendedAt = new Date();
    attendance.updatedAt = new Date();

    await attendance.save();

    // Audit Log entry
    try {
      await AuditLog.create({
        organizationId: req.user.organizationId,
        actorId: req.user.id,
        action: 'SHIFT_EXTENDED',
        entityType: 'Attendance',
        entityId: attendance._id,
        reason: 'Worker requested shift extension. Auto-stop grace timer deactivated.',
      });
    } catch (auditErr) {
      console.warn('AuditLog error on shift extend:', auditErr.message);
    }

    emitSocket(req, 'workerExtendedShift', attendance);

    res.json({
      message: 'Shift extension activated. Live overtime tracking engaged.',
      attendance,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 2C. CLOUDINARY OVERTIME PROOF UPLOAD ─────────────────────────────
router.post('/upload-overtime-proof', auth, upload.single('photo'), async (req, res) => {
  try {
    const { attendanceId, clientCapturedAt, deviceModel, latitude, longitude, accuracy, caption } = req.body;

    if (!attendanceId) {
      return res.status(400).json({ message: 'attendanceId is required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Photo file is required' });
    }

    const attendance = await Attendance.findOne({
      _id: attendanceId,
      organizationId: req.user.organizationId,
    });

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Stream upload buffer to Cloudinary with image_metadata to extract EXIF
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'crm_overtime_proofs',
          image_metadata: true,
          resource_type: 'image',
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    // Extract EXIF capture date and camera model safely
    const exifDate = uploadResult.image_metadata?.DateTimeOriginal
      ? parseExifDate(uploadResult.image_metadata.DateTimeOriginal)
      : (clientCapturedAt ? parseExifDate(clientCapturedAt) : new Date());

    const exifModel = uploadResult.image_metadata?.Model || deviceModel || 'Mobile Device';

    const proofPhoto = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      capturedAt: exifDate,
      serverReceivedAt: new Date(),
      location: {
        latitude: latitude ? Number(latitude) : undefined,
        longitude: longitude ? Number(longitude) : undefined,
        accuracy: accuracy ? Number(accuracy) : undefined,
      },
      deviceModel: exifModel,
      caption: caption || '',
    };

    if (!attendance.overtimeProofPhotos) {
      attendance.overtimeProofPhotos = [];
    }
    attendance.overtimeProofPhotos.push(proofPhoto);
    attendance.overtimeStatus = 'pending';
    attendance.updatedAt = new Date();

    await attendance.save();

    emitSocket(req, 'overtimeProofUploaded', {
      attendanceId: attendance._id,
      freelancerId: attendance.freelancerId,
      photo: proofPhoto,
    });

    res.status(201).json({
      message: 'Overtime proof photo uploaded and verified successfully',
      proofPhoto,
      attendance,
    });
  } catch (err) {
    console.error('Upload overtime proof error:', err);
    res.status(500).json({ message: err.message || 'Failed to upload overtime proof photo' });
  }
});

// ─── 3. LIST ATTENDANCE RECORDS ──────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { eventId, freelancerId, status, page = 1, limit = 25 } = req.query;
    const query = { organizationId: req.user.organizationId };

    if (req.user.role !== 'admin') {
      // Freelancer only sees own attendance
      query.freelancerId = req.user.id;
    } else if (freelancerId) {
      query.freelancerId = freelancerId;
    }

    if (eventId) query.eventId = eventId;
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      Attendance.find(query)
        .populate('eventId', 'title date startTime endTime location sessionPay overtimeRate travelAllowance')
        .populate('freelancerId', 'name email phone')
        .populate('adminReviewedBy', 'name email')
        .sort({ checkInAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Attendance.countDocuments(query),
    ]);

    res.json({
      attendance: records,
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

// ─── 4. GET SINGLE ATTENDANCE RECORD ─────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const query = { _id: req.params.id, organizationId: req.user.organizationId };
    if (req.user.role !== 'admin') {
      query.freelancerId = req.user.id;
    }

    const record = await Attendance.findOne(query)
      .populate('eventId')
      .populate('freelancerId', 'name email phone')
      .populate('adminReviewedBy', 'name');

    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 5. SUBMIT EXCEPTION / MANUAL CORRECTION REQUEST (Freelancer) ────
router.post('/request-correction', auth, async (req, res) => {
  try {
    const { eventId, attendanceId, requestType, requestedCheckIn, requestedCheckOut, reason } = req.body;

    if (!eventId || !requestType || !reason) {
      return res.status(400).json({ message: 'Event ID, request type, and reason are required' });
    }

    // Verify worker is assigned to event
    const assignment = await Assignment.findOne({
      eventId,
      freelancerId: req.user.id,
      status: { $in: ['assigned', 'accepted'] },
    });
    if (!assignment) {
      return res.status(403).json({ message: 'You are not assigned to this event' });
    }

    const request = new AttendanceRequest({
      organizationId: req.user.organizationId,
      eventId,
      freelancerId: req.user.id,
      attendanceId: attendanceId || null,
      requestType,
      requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn) : null,
      requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut) : null,
      reason,
      status: 'pending',
    });

    await request.save();

    emitSocket(req, 'attendanceRequestCreated', request);

    res.status(201).json({
      message: 'Attendance exception request submitted for admin review',
      request,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 6. LIST PENDING ATTENDANCE REQUESTS (Admin Only) ────────────────
router.get('/requests/pending', adminAuth, async (req, res) => {
  try {
    const requests = await AttendanceRequest.find({
      organizationId: req.user.organizationId,
      status: 'pending',
    })
      .populate('eventId', 'title date startTime endTime location')
      .populate('freelancerId', 'name email phone')
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 7. REVIEW ATTENDANCE REQUEST (Admin Only) ───────────────────────
router.patch('/requests/:id/review', adminAuth, async (req, res) => {
  try {
    const { action, reviewNote } = req.body; // 'approve' or 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
    }

    const request = await AttendanceRequest.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    request.status = action === 'approve' ? 'approved' : 'rejected';
    request.reviewedBy = req.user.id;
    request.reviewNote = reviewNote || '';
    request.reviewedAt = new Date();
    await request.save();

    let attendanceRecord = null;

    if (action === 'approve') {
      const event = await Event.findById(request.eventId);
      const scheduledStart = parseEventDateTime(event.date, event.startTime);
      const scheduledEnd = parseEventDateTime(event.date, event.endTime);

      if (request.attendanceId) {
        // Update existing attendance record
        attendanceRecord = await Attendance.findById(request.attendanceId);
        if (attendanceRecord) {
          if (request.requestedCheckIn) attendanceRecord.checkInAt = request.requestedCheckIn;
          if (request.requestedCheckOut) attendanceRecord.checkOutAt = request.requestedCheckOut;
          attendanceRecord.status = 'approved';
          attendanceRecord.adminReviewedBy = req.user.id;
          attendanceRecord.adminReviewNote = reviewNote || 'Approved via manual request';
          await attendanceRecord.save();
        }
      } else {
        // Create new manual attendance record
        const assignment = await Assignment.findOne({
          eventId: event._id,
          freelancerId: request.freelancerId,
        });

        const checkInAt = request.requestedCheckIn || scheduledStart;
        const checkOutAt = request.requestedCheckOut || scheduledEnd;
        const actualMinutes = Math.max(0, Math.round((checkOutAt - checkInAt) / 60000));

        attendanceRecord = new Attendance({
          organizationId: req.user.organizationId,
          eventId: event._id,
          freelancerId: request.freelancerId,
          assignmentId: assignment ? assignment._id : null,
          scheduledStart,
          scheduledEnd,
          checkInAt,
          checkOutAt,
          checkInMethod: 'manual',
          checkOutMethod: 'manual',
          status: 'approved',
          actualMinutes,
          adminReviewedBy: req.user.id,
          adminReviewNote: reviewNote || `Manually approved: ${request.reason}`,
        });
        await attendanceRecord.save();
      }

      // Record in immutable AuditLog
      await AuditLog.create({
        organizationId: req.user.organizationId,
        actorId: req.user.id,
        action: 'APPROVE_MANUAL_ATTENDANCE',
        entityType: 'AttendanceRequest',
        entityId: request._id,
        newValue: { status: 'approved', reason: request.reason },
        reason: reviewNote || 'Admin approved manual attendance exception',
      });

      // Auto-sync payout
      try {
        const { calculateAndSavePayout } = require('./payouts');
        await calculateAndSavePayout(attendanceRecord._id, req.user.organizationId);
      } catch (pErr) {
        console.error('[Manual Attendance Payout Sync Error]:', pErr.message);
      }
    }

    emitSocket(req, 'attendanceRequestReviewed', request, request.freelancerId.toString());

    res.json({ message: `Request ${action}d successfully`, request, attendance: attendanceRecord });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 8. REVIEW OVERTIME (Admin Only) ─────────────────────────────────
router.patch('/:id/review-overtime', adminAuth, async (req, res) => {
  try {
    const { action, approvedMinutes, note } = req.body; // 'approve' or 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be "approve" or "reject"' });
    }

    const attendance = await Attendance.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });

    const oldStatus = attendance.overtimeStatus;
    const oldMinutes = attendance.overtimeMinutes;

    if (action === 'approve') {
      attendance.overtimeStatus = 'approved';
      if (approvedMinutes !== undefined && Number(approvedMinutes) >= 0) {
        attendance.overtimeMinutes = Number(approvedMinutes);
      }
    } else {
      attendance.overtimeStatus = 'rejected';
      attendance.overtimeMinutes = 0;
    }

    attendance.adminReviewedBy = req.user.id;
    attendance.adminReviewNote = note || '';
    attendance.updatedAt = Date.now();
    await attendance.save();

    // Immutable Audit Log
    await AuditLog.create({
      organizationId: req.user.organizationId,
      actorId: req.user.id,
      action: action === 'approve' ? 'APPROVE_OVERTIME' : 'REJECT_OVERTIME',
      entityType: 'Attendance',
      entityId: attendance._id,
      oldValue: { overtimeStatus: oldStatus, overtimeMinutes: oldMinutes },
      newValue: { overtimeStatus: attendance.overtimeStatus, overtimeMinutes: attendance.overtimeMinutes },
      reason: note || `Admin ${action}d overtime claim`,
    });

    // Automatically recalculate payout to reflect approved/rejected overtime!
    try {
      const { calculateAndSavePayout } = require('./payouts');
      await calculateAndSavePayout(attendance._id, req.user.organizationId);
    } catch (pErr) {
      console.error('[Overtime Payout Recalculation Error]:', pErr.message);
    }

    emitSocket(req, 'overtimeReviewed', attendance, attendance.freelancerId.toString());

    res.json({ message: `Overtime ${action}d successfully`, attendance });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
