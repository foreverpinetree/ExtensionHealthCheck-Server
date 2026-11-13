var express = require('express');
var router = express.Router();

const paddle = require('../paddle.json')
/* GET home page. */
router.get('/redirect', function(req, res, next) {
  let query = req.query
  let uid = query.uid
  let sub = query.plan
  let app = query.app
  let v = query.v
  v = v === '1.0.0' ? '' : v
  let product = paddle[sub]
  if(v){
    sub = sub + `-${v}`
    if(paddle[sub]){
      product = paddle[sub]
    }
  }

  let data = {
    vendor: paddle.vendor,
    prodcut: product,
    params: JSON.stringify({uid: uid, app: app, v: v})
  }
  res.render('paddle', data)
});

module.exports = router;
