var express = require("express");
var router = express.Router();

const host = 'https://extensionhealthcheck.extensionsbox.com'
/* GET home page. */
router.get("/", function(req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.render('index');
});

router.get("/terms", function(req, res, next) {
  res.render('terms', { canonical: `${host}/terms` });
});

router.get("/privacy", function(req, res, next) {
  res.render('privacy', { canonical: `${host}/privacy` });
});

/* router.get("/guide", function(req, res, next) {
    res.render('guide', { canonical: `${host}/guide` });
}); */

module.exports = router;