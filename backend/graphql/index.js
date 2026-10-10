const express = require('express');
const { graphql } = require('graphql');
const schema = require('./schema');
const resolvers = require('./resolvers');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /graphql - Info & Healthcheck
router.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Unified GraphQL Layer for Plexis CRM',
    endpoints: {
      query: 'POST /graphql',
    },
  });
});

// POST /graphql - Authenticated GraphQL execution
router.post('/', auth, async (req, res) => {
  try {
    const { query, variables } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        errors: [{ message: 'A valid GraphQL query string must be provided in the request body' }],
      });
    }

    const result = await graphql({
      schema,
      source: query,
      rootValue: resolvers,
      contextValue: { user: req.user, req },
      variableValues: variables,
    });

    if (result.errors && result.errors.length > 0) {
      return res.status(200).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[GraphQL Execution Error]', err);
    return res.status(500).json({
      errors: [{ message: err.message || 'Internal GraphQL server execution error' }],
    });
  }
});

module.exports = router;
