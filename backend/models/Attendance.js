const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
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
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true,
  },
  scheduledStart: {
    type: Date,
    required: true,
  },
  scheduledEnd: {
    type: Date,
    required: true,
  },
  checkInAt: {
    type: Date,
  },
  checkInLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    distanceFromVenue: Number, // distance in meters calculated by server
    isWithinGeofence: Boolean,
  },
  checkInMethod: {
    type: String,
    enum: ['gps', 'auto_gps', 'manual'],
    default: 'gps',
  },
  checkOutAt: {
    type: Date,
  },
  checkOutLocation: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    distanceFromVenue: Number,
    isWithinGeofence: Boolean,
  },
  checkOutMethod: {
    type: String,
    enum: ['gps', 'manual', 'auto'],
    default: 'gps',
  },
  status: {
    type: String,
    enum: [
      'checked_in',
      'completed',
      'missing_checkout',
      'manual_review',
      'approved',
      'rejected',
      'auto_closed',
    ],
    default: 'checked_in',
  },
  notes: {
    type: String,
    default: '',
  },
  actualMinutes: {
    type: Number,
    default: 0,
  },
  overtimeMinutes: {
    type: Number,
    default: 0,
  },
  overtimeStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none',
  },
  isExtended: {
    type: Boolean,
    default: false,
  },
  extendedAt: {
    type: Date,
  },
  overtimeProofPhotos: [
    {
      url: { type: String, required: true },
      publicId: { type: String },
      capturedAt: { type: Date, default: Date.now },
      serverReceivedAt: { type: Date, default: Date.now },
      location: {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
      },
      deviceModel: { type: String, default: 'Mobile Device' },
      caption: { type: String, default: '' },
    },
  ],
  adminReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  adminReviewNote: {
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

AttendanceSchema.index({ organizationId: 1, eventId: 1, freelancerId: 1 });
AttendanceSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
