const express = require('express');
const Lead = require('../models/Lead');
const { auth, adminAuth } = require('../middleware/auth');
const { isValidEmail, isValidPhone, formatPhone, escapeRegex } = require('../utils/validators');
const router = express.Router();

/**
 * Emit a lead event to:
 *  - the lead owner's personal room
 *  - the tenant's admin room: `admin:${orgId}`
 * Never broadcasts across multiple tenant organizations.
 */
function emitLeadEvent(io, eventName, payload, ownerUserId, orgId = null) {
  if (!io) return;
  if (ownerUserId) {
    io.to(ownerUserId.toString()).emit(eventName, payload);
  }
  if (orgId) {
    io.to(`admin:${orgId.toString()}`).emit(eventName, payload);
    io.to(`org:${orgId.toString()}`).emit(eventName, payload);
  }
}

// ── Create lead ──────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { name, email, phone, source, location } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'Client name is required and must be at least 2 characters' });
  }

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  if (phone && phone.trim() !== '') {
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: 'Please provide a valid 10-digit phone number (e.g. 9876543210 or +91 9876543210)' });
    }
  }

  try {
    const lead = new Lead({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone && isValidPhone(phone) ? formatPhone(phone) : '',
      source: source || 'Website',
      location: location || {},
      userId: req.user.id,
      organizationId: req.user.organizationId || null,
    });
    await lead.save();

    // Populate so the client gets userId.name and userId.email
    await lead.populate('userId', 'name email');

    const io = req.app.get('io');
    emitLeadEvent(io, 'leadCreated', lead, req.user.id, lead.organizationId);

    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Get leads ────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { search, status, source, page = 1, limit = 10 } = req.query;
    let query = {};

    if (req.user.role !== 'admin') {
      query.userId = req.user.id;
    } else if (req.user.organizationId) {
      // Scoped to admin's organization
      query.$or = [
        { organizationId: req.user.organizationId },
        { organizationId: null } // allow legacy leads created before migration
      ];
    }

    if (search) {
      const safeSearch = escapeRegex(String(search).trim());
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    if (status) query.status = status;
    if (source) query.source = source;

    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      Lead.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Lead.countDocuments(query),
    ]);

    res.json({
      leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get single lead ──────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).populate('userId', 'name email');
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    if (req.user.role !== 'admin') {
      if (lead.userId._id.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (req.user.organizationId && lead.organizationId && lead.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ message: 'Access denied: Lead belongs to another organization' });
    }

    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Update lead ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const { status, notes, name, email, phone, source, location } = req.body;
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const ownerId = lead.userId.toString();

    if (req.user.role !== 'admin') {
      if (ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (req.user.organizationId && lead.organizationId && lead.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ message: 'Access denied: Lead belongs to another organization' });
    }

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ message: 'Client name must be at least 2 characters' });
      }
      lead.name = name.trim();
    }
    if (email !== undefined) {
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ message: 'Please provide a valid email address' });
      }
      lead.email = email.trim().toLowerCase();
    }
    if (phone !== undefined) {
      if (phone && phone.trim() !== '') {
        if (!isValidPhone(phone)) {
          return res.status(400).json({ message: 'Please provide a valid 10-digit phone number (e.g. 9876543210 or +91 9876543210)' });
        }
        lead.phone = formatPhone(phone);
      } else {
        lead.phone = '';
      }
    }
    if (source)            lead.source = source;
    if (status)            lead.status = status;
    if (location !== undefined) {
      lead.location = {
        address: location.address !== undefined ? location.address : (lead.location?.address || ''),
        city: location.city !== undefined ? location.city : (lead.location?.city || ''),
        latitude: location.latitude !== undefined ? location.latitude : lead.location?.latitude,
        longitude: location.longitude !== undefined ? location.longitude : lead.location?.longitude
      };
    }
    if (notes)             lead.notes.push({ text: notes });
    lead.updatedAt = Date.now();

    await lead.save();

    // Populate AFTER save so the emitted payload has userId.name/email
    await lead.populate('userId', 'name email');

    const io = req.app.get('io');
    emitLeadEvent(io, 'leadUpdated', lead, ownerId, lead.organizationId);

    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Add note to lead ─────────────────────────────────────────────────
router.post('/:id/notes', auth, async (req, res) => {
  const { text } = req.body;
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const ownerId = lead.userId.toString();

    if (req.user.role !== 'admin') {
      if (ownerId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (req.user.organizationId && lead.organizationId && lead.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ message: 'Access denied: Lead belongs to another organization' });
    }

    lead.notes.push({ text });
    lead.updatedAt = Date.now();
    await lead.save();

    await lead.populate('userId', 'name email');

    const io = req.app.get('io');
    emitLeadEvent(io, 'leadUpdated', lead, ownerId, lead.organizationId);

    res.json(lead);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Delete lead ──────────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    if (req.user.organizationId && lead.organizationId && lead.organizationId.toString() !== req.user.organizationId.toString()) {
      return res.status(403).json({ message: 'Access denied: Lead belongs to another organization' });
    }

    const ownerId = lead.userId.toString();

    await Lead.findByIdAndDelete(req.params.id);

    const io = req.app.get('io');
    emitLeadEvent(io, 'leadDeleted', req.params.id, ownerId, lead.organizationId);

    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;