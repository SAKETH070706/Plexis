const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
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
    enum: ['assigned', 'applied', 'accepted', 'declined', 'cancelled'],
    default: 'assigned',
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

module.exports = mongoose.model('Assignment', AssignmentSchema);
