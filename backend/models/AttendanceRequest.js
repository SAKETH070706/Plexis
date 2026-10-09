const mongoose = require('mongoose');

const AttendanceRequestSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  freelancerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  attendanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
  },
  requestType: {
    type: String,
    enum: ['missing_checkin', 'missing_checkout', 'both', 'correction'],
    required: true,
  },
  requestedCheckIn: {
    type: Date,
  },
  requestedCheckOut: {
    type: Date,
  },
  reason: {
    type: String,
    required: [true, 'Reason for exception request is required'],
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewNote: {
    type: String,
    trim: true,
  },
  reviewedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

AttendanceRequestSchema.index({ organizationId: 1, status: 1 });
AttendanceRequestSchema.index({ eventId: 1, freelancerId: 1 });

module.exports = mongoose.model('AttendanceRequest', AttendanceRequestSchema);
