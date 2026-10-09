const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
  },
  clientName: {
    type: String,
    trim: true,
  },
  clientPhone: {
    type: String,
    trim: true,
  },
  date: {
    type: Date,
    required: [true, 'Event date is required'],
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required (e.g., 09:00)'],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid start time format. Expected HH:MM (e.g., 09:00)'],
  },
  endTime: {
    type: String,
    required: [true, 'End time is required (e.g., 17:00)'],
    match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid end time format. Expected HH:MM (e.g., 17:00)'],
  },
  location: {
    address: {
      type: String,
      required: [true, 'Location address is required'],
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required for geofencing'],
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required for geofencing'],
    },
    radius: {
      type: Number,
      default: 150, // default geofence radius in meters
    },
  },
  requiredWorkers: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  sessionPay: {
    type: Number,
    required: [true, 'Session base pay is required'],
    min: 0,
    default: 0,
  },
  overtimeRate: {
    type: Number,
    default: 0, // Hourly rate for overtime
    min: 0,
  },
  travelAllowance: {
    type: Number,
    default: 0,
    min: 0,
  },
  assignmentMode: {
    type: String,
    enum: ['direct', 'open'],
    default: 'direct',
  },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

EventSchema.index({ organizationId: 1, date: 1, status: 1 });

module.exports = mongoose.model('Event', EventSchema);
