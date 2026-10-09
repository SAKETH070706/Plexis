const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;

    // Fallback for legacy tokens without organizationId
    if (!req.user.organizationId) {
      const dbUser = await User.findById(req.user.id).select('organizationId role');
      if (dbUser && dbUser.organizationId) {
        req.user.organizationId = dbUser.organizationId;
        req.user.role = dbUser.role;
      }
    }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin role required' });
    }
    next();
  });
};

module.exports = { auth, adminAuth };

