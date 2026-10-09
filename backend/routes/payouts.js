const express = require('express');
const Payout = require('../models/Payout');
const Attendance = require('../models/Attendance');
const Event = require('../models/Event');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { auth, adminAuth } = require('../middleware/auth');

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
  } else {
    io.to('admin').emit(eventName, payload);
  }
}

// ─── HELPER: CALCULATE & CREATE/UPDATE PAYOUT ────────────────────────
async function calculateAndSavePayout(attendanceId, orgId, customNotes = '') {
  const attendance = await Attendance.findById(attendanceId).populate('eventId');
  if (!attendance) throw new Error('Attendance record not found');

  if (orgId && attendance.organizationId && attendance.organizationId.toString() !== orgId.toString()) {
    throw new Error('Access denied: Attendance record belongs to another organization');
  }

  const event = attendance.eventId;
  const basePay = Number(event.sessionPay) || 0;
  const travelAllowance = Number(event.travelAllowance) || 0;

  // Overtime pay is ONLY included if explicitly approved by admin
  let overtimePay = 0;
  if (attendance.overtimeStatus === 'approved' && attendance.overtimeMinutes > 0) {
    const hourlyRate = Number(event.overtimeRate) || 0;
    overtimePay = Math.round((attendance.overtimeMinutes / 60) * hourlyRate);
  }

  const existingPayout = await Payout.findOne({ attendanceId: attendance._id });

  if (existingPayout) {
    // If already marked 'paid', do not silently mutate historical payout
    if (existingPayout.status === 'paid') {
      return existingPayout;
    }

    // Update pending/approved payout
    existingPayout.basePay = basePay;
    existingPayout.travelAllowance = travelAllowance;
    existingPayout.overtimePay = overtimePay;
    existingPayout.totalAmount = basePay + travelAllowance + overtimePay + (existingPayout.bonus || 0) - (existingPayout.deduction || 0);
    existingPayout.updatedAt = Date.now();
    await existingPayout.save();
    return existingPayout;
  }

  // Create new Payout
  const totalAmount = basePay + travelAllowance + overtimePay;

  try {
    const payout = new Payout({
      organizationId: orgId,
      eventId: event._id,
      freelancerId: attendance.freelancerId,
      attendanceId: attendance._id,
      basePay,
      overtimePay,
      travelAllowance,
      totalAmount,
      status: 'pending',
      notes: customNotes,
    });

    await payout.save();
    return payout;
  } catch (saveErr) {
    if (saveErr.code === 11000) {
      const concurrentPayout = await Payout.findOne({ attendanceId: attendance._id });
      if (concurrentPayout) {
        if (concurrentPayout.status !== 'paid') {
          concurrentPayout.basePay = basePay;
          concurrentPayout.travelAllowance = travelAllowance;
          concurrentPayout.overtimePay = overtimePay;
          concurrentPayout.totalAmount = basePay + travelAllowance + overtimePay + (concurrentPayout.bonus || 0) - (concurrentPayout.deduction || 0);
          concurrentPayout.updatedAt = Date.now();
          await concurrentPayout.save();
        }
        return concurrentPayout;
      }
    }
    throw saveErr;
  }
}

// ─── 1. GENERATE PAYOUT (Admin or Trigger) ───────────────────────────
router.post('/generate/:attendanceId', adminAuth, async (req, res) => {
  try {
    const payout = await calculateAndSavePayout(
      req.params.attendanceId,
      req.user.organizationId,
      'Generated via Admin API'
    );

    emitSocket(req, 'payoutCreated', payout, payout.freelancerId.toString());
    emitSocket(req, 'payoutCreated', payout, 'admin');

    res.status(201).json(payout);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A payout already exists for this attendance session' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. LIST PAYOUTS ─────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, freelancerId, eventId, page = 1, limit = 25 } = req.query;
    const query = { organizationId: req.user.organizationId };

    if (req.user.role !== 'admin') {
      // Freelancer only sees own payouts
      query.freelancerId = req.user.id;
    } else if (freelancerId) {
      query.freelancerId = freelancerId;
    }

    if (status) query.status = status;
    if (eventId) query.eventId = eventId;

    const skip = (page - 1) * limit;
    const [payouts, total] = await Promise.all([
      Payout.find(query)
        .populate('freelancerId', 'name email phone')
        .populate('eventId', 'title date startTime endTime location')
        .populate('attendanceId', 'checkInAt checkOutAt actualMinutes overtimeMinutes overtimeStatus')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Payout.countDocuments(query),
    ]);

    res.json({
      payouts,
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

// ─── 3. ORGANIZATION FINANCIAL SUMMARY (Admin Only) ──────────────────
router.get('/summary', adminAuth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const orgObjId = new mongoose.Types.ObjectId(req.user.organizationId);

    const [pendingAgg, approvedAgg, paidAgg, recentPayouts] = await Promise.all([
      Payout.aggregate([
        { $match: { organizationId: orgObjId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Payout.aggregate([
        { $match: { organizationId: orgObjId, status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Payout.aggregate([
        { $match: { organizationId: orgObjId, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Payout.find({ organizationId: orgObjId })
        .populate('freelancerId', 'name email')
        .populate('eventId', 'title date')
        .sort({ updatedAt: -1 })
        .limit(5),
    ]);

    res.json({
      pendingTotal: pendingAgg[0]?.total || 0,
      pendingCount: pendingAgg[0]?.count || 0,
      approvedTotal: approvedAgg[0]?.total || 0,
      approvedCount: approvedAgg[0]?.count || 0,
      paidTotal: paidAgg[0]?.total || 0,
      paidCount: paidAgg[0]?.count || 0,
      recentPayouts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 4. FREELANCER EARNINGS DASHBOARD ────────────────────────────────
router.get('/freelancer/earnings', auth, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const freelancerObjId = new mongoose.Types.ObjectId(req.user.id);
    const orgObjId = new mongoose.Types.ObjectId(req.user.organizationId);

    const [paidAgg, pendingAgg, history] = await Promise.all([
      Payout.aggregate([
        { $match: { freelancerId: freelancerObjId, organizationId: orgObjId, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Payout.aggregate([
        { $match: { freelancerId: freelancerObjId, organizationId: orgObjId, status: { $in: ['pending', 'approved'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      Payout.find({ freelancerId: freelancerObjId, organizationId: orgObjId })
        .populate('eventId', 'title date startTime endTime location')
        .sort({ createdAt: -1 })
        .limit(10),
    ]);


    res.json({
      totalPaid: paidAgg[0]?.total || 0,
      completedGigsCount: paidAgg[0]?.count || 0,
      pendingEarnings: pendingAgg[0]?.total || 0,
      pendingGigsCount: pendingAgg[0]?.count || 0,
      history,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 5. GET SINGLE PAYOUT DETAILS ────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const query = { _id: req.params.id, organizationId: req.user.organizationId };
    if (req.user.role !== 'admin') {
      query.freelancerId = req.user.id;
    }

    const payout = await Payout.findOne(query)
      .populate('freelancerId', 'name email phone')
      .populate('eventId', 'title date startTime endTime location sessionPay overtimeRate travelAllowance')
      .populate('attendanceId')
      .populate('approvedBy', 'name email');

    if (!payout) return res.status(404).json({ message: 'Payout not found' });

    res.json(payout);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 6. APPROVE PAYOUT (Admin Only) ──────────────────────────────────
router.patch('/:id/approve', adminAuth, async (req, res) => {
  try {
    const payout = await Payout.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!payout) return res.status(404).json({ message: 'Payout not found' });
    if (payout.status === 'paid') {
      return res.status(400).json({ message: 'Payout is already marked as paid' });
    }

    const oldStatus = payout.status;
    payout.status = 'approved';
    payout.approvedBy = req.user.id;
    payout.approvedAt = new Date();
    payout.updatedAt = Date.now();
    await payout.save();

    // Immutable Audit Log
    await AuditLog.create({
      organizationId: req.user.organizationId,
      actorId: req.user.id,
      action: 'APPROVE_PAYOUT',
      entityType: 'Payout',
      entityId: payout._id,
      oldValue: { status: oldStatus },
      newValue: { status: 'approved', totalAmount: payout.totalAmount },
      reason: 'Admin approved shift payout',
    });

    emitSocket(req, 'payoutApproved', payout, payout.freelancerId.toString());

    res.json({ message: 'Payout approved successfully', payout });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 7. MARK PAYOUT AS PAID (Admin Only) ─────────────────────────────
router.patch('/:id/paid', adminAuth, async (req, res) => {
  try {
    const { paymentReference, notes } = req.body;

    const payout = await Payout.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId,
        status: { $ne: 'paid' },
      },
      {
        $set: {
          status: 'paid',
          paidAt: new Date(),
          ...(paymentReference ? { paymentReference } : {}),
          ...(notes ? { notes } : {}),
          updatedAt: Date.now(),
        },
      },
      { new: true }
    );

    if (!payout) {
      const existing = await Payout.findOne({
        _id: req.params.id,
        organizationId: req.user.organizationId,
      });
      if (existing && existing.status === 'paid') {
        return res.status(400).json({ message: 'Payout is already marked as paid' });
      }
      return res.status(404).json({ message: 'Payout not found' });
    }

    // Immutable Audit Log
    await AuditLog.create({
      organizationId: req.user.organizationId,
      actorId: req.user.id,
      action: 'MARK_PAYOUT_PAID',
      entityType: 'Payout',
      entityId: payout._id,
      newValue: { status: 'paid', paymentReference, totalAmount: payout.totalAmount },
      reason: `Disbursed with ref: ${paymentReference || 'N/A'}`,
    });

    emitSocket(req, 'payoutPaid', payout, payout.freelancerId.toString());

    res.json({ message: 'Payout marked as paid successfully', payout });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 8. ADJUST PAYOUT (BONUS / DEDUCTION) (Admin Only) ────────────────
router.patch('/:id/adjust', adminAuth, async (req, res) => {
  try {
    const { bonus = 0, deduction = 0, reason } = req.body;

    const payout = await Payout.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });

    if (!payout) return res.status(404).json({ message: 'Payout not found' });
    if (payout.status === 'paid') {
      return res.status(400).json({ message: 'Cannot adjust a payout that is already paid. Please create an adjustment transaction.' });
    }

    const oldTotal = payout.totalAmount;
    const safeBonus = Math.max(0, Number(bonus) || 0);
    const safeDeduction = Math.max(0, Number(deduction) || 0);

    payout.bonus = safeBonus;
    payout.deduction = safeDeduction;
    payout.totalAmount = Math.max(0, (payout.basePay || 0) + (payout.travelAllowance || 0) + (payout.overtimePay || 0) + safeBonus - safeDeduction);
    payout.updatedAt = Date.now();
    await payout.save();

    // Immutable Audit Log
    await AuditLog.create({
      organizationId: req.user.organizationId,
      actorId: req.user.id,
      action: 'ADJUST_PAYOUT',
      entityType: 'Payout',
      entityId: payout._id,
      oldValue: { totalAmount: oldTotal },
      newValue: { bonus, deduction, totalAmount: payout.totalAmount },
      reason: reason || 'Admin adjusted payout amounts',
    });

    res.json({ message: 'Payout adjusted successfully', payout });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = {
  router,
  calculateAndSavePayout,
};
