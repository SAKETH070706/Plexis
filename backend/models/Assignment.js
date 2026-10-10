const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const AssignmentSchema = new mongoose.Schema({
  uuid: {
    type: String,
    unique: true,
    index: true,
    default: uuidv4,
  },
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
  status: {
    type: String,
    enum: ['assigned', 'applied', 'accepted', 'waitlist', 'declined', 'cancelled', 'completed'],
    default: 'assigned',
  },
  joinedVia: {
    type: String,
    enum: ['event_code', 'direct_admin', 'open_apply'],
    default: 'event_code',
  },
  // Denormalized Fast Snapshot
  eventCode: {
    type: String,
    trim: true,
    uppercase: true,
  },
  eventTitle: {
    type: String,
    trim: true,
  },
  eventDate: {
    type: Date,
  },
  sessionPay: {
    type: Number,
    default: 0,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  appliedAt: {
    type: Date,
  },
  respondedAt: {
    type: Date,
  },
  notes: {
    type: String,
    trim: true,
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

// Compound unique index: prevents duplicate assignment of the same freelancer to the same event
AssignmentSchema.index({ eventId: 1, freelancerId: 1 }, { unique: true });
AssignmentSchema.index({ organizationId: 1, freelancerId: 1, status: 1 });
AssignmentSchema.index({ eventId: 1, status: 1 });
AssignmentSchema.index({ freelancerId: 1, status: 1 });

module.exports = mongoose.model('Assignment', AssignmentSchema);
