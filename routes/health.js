const express = require('express');

module.exports = function createHealthRoutes(monitor) {
  const router = express.Router();
  router.get('/api/status', async function(req, res, next) {
    try {
      res.set('Cache-Control', 'no-store');
      const status = await monitor.getStatus();
      res.status(status.monitorError || status.configurationError ? 503 : 200).json(status);
    } catch (error) {
      next(error);
    }
  });
  return router;
};
