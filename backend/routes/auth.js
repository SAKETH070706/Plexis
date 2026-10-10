const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { auth, adminAuth } = require('../middleware/auth');
const { isValidEmail, isValidPhone, formatPhone } = require('../utils/validators');
const { createRateLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many attempts from this IP, please try again after 15 minutes',
});

// Helper to sign JWT
const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId || null,
    },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
};

// ── Register new user ────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password, role, organizationName, organizationId, studioCode, phone, eventCode } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters long' });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  if (phone && phone.trim() !== '') {
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Please provide a valid 10-digit phone number (e.g. 9876543210 or +91 9876543210)' });
    }
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    // If eventCode provided during registration, validate event existence upfront
    let targetEvent = null;
    if (eventCode) {
      const cleanEventCode = String(eventCode).trim().toUpperCase();
      const Event = require('../models/Event');
      targetEvent = await Event.findOne({ eventCode: cleanEventCode });
      if (!targetEvent) {
        return res.status(404).json({ message: 'Invalid Event Code' });
      }
      if (targetEvent.status === 'cancelled' || targetEvent.status === 'completed') {
        return res.status(400).json({ message: 'Cannot join an inactive or completed event' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const assignedRole = role || 'user';

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: assignedRole,
      phone: phone && isValidPhone(phone) ? formatPhone(phone) : '',
    });

    // Handle Organization association
    if (assignedRole === 'admin') {
      let org = null;
      if (studioCode) {
        org = await Organization.findOne({ studioCode: studioCode.trim().toUpperCase() });
      }

      if (org) {
        // Prevent claiming an organization that already has an owner
        if (org.ownerId && org.ownerId.toString() !== user._id.toString()) {
          const ownerExists = await User.findById(org.ownerId);
          if (ownerExists) {
            return res.status(400).json({ message: 'This studio organization is already registered. Please login or contact the studio owner.' });
          }
        }
        org.ownerId = user._id;
        if (organizationName) org.name = organizationName;
        await org.save();
        user.organizationId = org._id;
      } else {
        // Create new organization for admin
        const newOrg = new Organization({
          name: organizationName || `${name}'s Organization`,
          ownerId: user._id,
        });
        await newOrg.save();
        user.organizationId = newOrg._id;
      }
    } else if (assignedRole === 'freelancer') {
      // Independent freelancers: studioCode/organizationId are completely optional
      let targetOrg = null;
      if (studioCode) {
        const cleanInput = studioCode.trim().toUpperCase();
        const variations = [cleanInput];
        if (cleanInput.startsWith('STU-')) {
          variations.push(cleanInput.replace('STU-', ''));
        } else if (cleanInput.startsWith('STU') && cleanInput.length > 3) {
          variations.push(`STU-${cleanInput.slice(3)}`);
        } else {
          variations.push(`STU-${cleanInput}`);
        }

        const mongoose = require('mongoose');
        const orConditions = [{ studioCode: { $in: variations } }];
        if (mongoose.isValidObjectId(cleanInput)) {
          orConditions.push({ _id: cleanInput });
        }
        targetOrg = await Organization.findOne({ $or: orConditions });
      }
      if (!targetOrg && organizationId) {
        const mongoose = require('mongoose');
        if (mongoose.isValidObjectId(organizationId)) {
          targetOrg = await Organization.findById(organizationId);
        }
      }

      // If studioCode was provided but not found, return 404
      if (studioCode && !targetOrg) {
        return res.status(404).json({ message: 'Invalid Studio Code / Organization ID' });
      }

      user.organizationId = targetOrg ? targetOrg._id : null;
    } else {
      // Legacy 'user' role
      let defaultOrg = await Organization.findOne();
      if (!defaultOrg) {
        defaultOrg = new Organization({
          name: 'Main Studio Organization',
          ownerId: user._id,
        });
        await defaultOrg.save();
      }
      user.organizationId = defaultOrg._id;
    }

    await user.save();

    let joinResult = null;
    if (eventCode && targetEvent) {
      const { joinEventByCode } = require('./events');
      joinResult = await joinEventByCode(user, targetEvent.eventCode, req);
    }

    const token = signToken(user);
    const org = user.organizationId ? await Organization.findById(user.organizationId) : null;

    const responsePayload = {
      token,
      user: {
        id: user._id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organization: org ? { id: org._id, name: org.name, studioCode: org.studioCode } : null,
      },
    };

    if (joinResult && joinResult.data) {
      responsePayload.assignment = joinResult.data.assignment;
      responsePayload.isWaitlisted = joinResult.data.isWaitlisted;
      responsePayload.message = joinResult.data.message;
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Login user ───────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password, studioCode, organizationId } = req.body;
  try {
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // Backwards-compatibility check: ensure admin has an organization
    if (!user.organizationId && user.role === 'admin') {
      let org = await Organization.findOne({ ownerId: user._id });
      if (!org) {
        org = new Organization({
          name: `${user.name}'s Organization`,
          ownerId: user._id,
        });
        await org.save();
      }
      user.organizationId = org._id;
      await user.save();
    }

    // Ensure uuid exists on legacy user documents
    if (!user.uuid) {
      const { v4: uuidv4 } = require('uuid');
      user.uuid = uuidv4();
      await user.save();
    }

    // If studioCode or organizationId was provided, verify user belongs to it
    if (studioCode || organizationId) {
      let specifiedOrg = null;
      if (studioCode) {
        const cleanInput = studioCode.trim().toUpperCase();
        const variations = [cleanInput];
        if (cleanInput.startsWith('STU-')) {
          variations.push(cleanInput.replace('STU-', ''));
        } else if (cleanInput.startsWith('STU') && cleanInput.length > 3) {
          variations.push(`STU-${cleanInput.slice(3)}`);
        } else {
          variations.push(`STU-${cleanInput}`);
        }

        const mongoose = require('mongoose');
        const orConditions = [{ studioCode: { $in: variations } }];
        if (mongoose.isValidObjectId(cleanInput)) {
          orConditions.push({ _id: cleanInput });
        }
        specifiedOrg = await Organization.findOne({ $or: orConditions });
      }
      if (!specifiedOrg && organizationId) {
        const mongoose = require('mongoose');
        if (mongoose.isValidObjectId(organizationId)) {
          specifiedOrg = await Organization.findById(organizationId);
        }
      }

      if (user.organizationId && (!specifiedOrg || specifiedOrg._id.toString() !== user.organizationId.toString())) {
        return res.status(403).json({ message: 'Access denied: You do not belong to this studio' });
      }
    }

    const token = signToken(user);
    const org = user.organizationId ? await Organization.findById(user.organizationId) : null;

    res.json({
      token,
      user: {
        id: user._id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organization: org ? { id: org._id, name: org.name, studioCode: org.studioCode } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── Protected route: profile ─────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('organizationId', 'name currency address');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Current user endpoint ────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get organization details ─────────────────────────────────────────
router.get('/organization', auth, async (req, res) => {
  try {
    if (!req.user.organizationId) {
      return res.status(404).json({ message: 'No organization linked' });
    }
    const org = await Organization.findById(req.user.organizationId).populate('ownerId', 'name email');
    res.json(org);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get workers / freelancers list for admin ─────────────────────────
router.get('/workers', adminAuth, async (req, res) => {
  try {
    let orgId = req.user.organizationId;
    if (!orgId) {
      const adminUser = await User.findById(req.user.id);
      if (adminUser?.organizationId) orgId = adminUser.organizationId;
    }
    if (!orgId) {
      const singleOrg = await Organization.findOne();
      if (singleOrg) orgId = singleOrg._id;
    }

    const query = {
      role: { $in: ['freelancer', 'user'] },
      organizationId: orgId,
    };

    const workers = await User.find(query).select('-password');
    res.json(workers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin-only route example ─────────────────────────────────────────
router.get('/admin-dashboard', adminAuth, async (req, res) => {
  res.json({ message: 'Welcome Admin!' });
});

module.exports = router;