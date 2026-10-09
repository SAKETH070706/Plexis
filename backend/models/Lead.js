const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  source: { type: String, default: 'Website' },
  status: { type: String, enum: ['new', 'contacted', 'converted'], default: 'new' },
  notes: [{ text: String, date: { type: Date, default: Date.now } }],
  location: {
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    latitude: { type: Number },
    longitude: { type: Number }
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lead', LeadSchema);