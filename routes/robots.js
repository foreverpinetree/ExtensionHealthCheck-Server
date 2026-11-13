const express = require('express');
const router = express.Router();

router.use(function(req, res, next) {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

// 禁止搜索引擎抓取
router.get('/robots.txt', function(req, res) {
  res.set('Cache-Control', 'no-store');
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

module.exports = router;
