const express = require('express');
const crypto = require('node:crypto');
const { service } = require('./service');

function createRouter(sync = service) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const expected = process.env.ATLAS_SYNC_ADMIN_TOKEN;
    if (expected) {
      const actual = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
      const secret = Buffer.from(expected);
      if (actual.length !== secret.length || !crypto.timingSafeEqual(actual, secret)) {
        return res.status(401).json({ error: 'Enter the Atlas settings access key configured on the backend.' });
      }
    } else if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return res.status(403).json({ error: 'Open Atlas settings on the server computer, or configure ATLAS_SYNC_ADMIN_TOKEN for network access.' });
    } else if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({ error: 'Invalid request origin.' }); }
      if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
        return res.status(403).json({ error: 'Configure ATLAS_SYNC_ADMIN_TOKEN to change Atlas settings from another computer.' });
      }
    }
    next();
  });
  const handle = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Atlas settings are unavailable. Check local MongoDB and the backend configuration.' }); }
  };
  router.get('/status', handle(() => sync.status()));
  router.post('/test', handle(req => sync.test(req.body || {})));
  router.put('/connection', handle(req => sync.save(req.body || {})));
  router.delete('/connection', handle(() => sync.disconnect()));
  router.post('/sync', handle(() => sync.sync()));
  router.get('/conflicts', handle(() => sync.listConflicts()));
  router.get('/conflicts/:key', handle(req => sync.conflictDetail(req.params.key)));
  router.post('/conflicts/:key/resolve', handle(req => sync.resolve(req.params.key, req.body?.side, req.body)));
  return router;
}

module.exports = createRouter;
