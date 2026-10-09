const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  address: {
    type: String,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  studioCode: {
    type: String,
    unique: true,
    uppercase: true,
    trim: true,
    sparse: true,
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

OrganizationSchema.pre('save', async function (next) {
  if (!this.studioCode) {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let isUnique = false;
    let code = '';
    while (!isUnique) {
      code = 'STU-';
      for (let i = 0; i < 4; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      const existing = await mongoose.models.Organization?.findOne({ studioCode: code });
      if (!existing) isUnique = true;
    }
    this.studioCode = code;
  }
  next();
});

module.exports = mongoose.model('Organization', OrganizationSchema);

