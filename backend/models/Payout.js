const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema({
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
    required: true,
    unique: true, // Guarantees one payout per attendance record
  },
  basePay: {
    type: Number,
    required: true,
    default: 0,
  },
  overtimePay: {
    type: Number,
    default: 0,
  },
  travelAllowance: {
    type: Number,
    default: 0,
  },
  bonus: {
    type: Number,
    default: 0,
  },
  deduction: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'rejected'],
    default: 'pending',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  paidAt: {
    type: Date,
  },
  paymentReference: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
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

PayoutSchema.index({ organizationId: 1, freelancerId: 1, status: 1 });
PayoutSchema.index({ organizationId: 1, eventId: 1 });

module.exports = mongoose.model('Payout', PayoutSchema);
