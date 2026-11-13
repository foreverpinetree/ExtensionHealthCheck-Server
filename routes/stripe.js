var express = require('express');
var router = express.Router();

const stripe = require('../ctrls/stripe')
// const stirpeJson = require('../stripe.json')
/* GET home page. */
router.get('/redirect', async function(req, res, next) {
  let uid = req.query.uid
  let app = req.query.app
  let v = req.query.v
  let _plan = req.query.plan
  let planOpts = await stripe.fetchPlanOptions(uid, true)
  let subs = planOpts.subs
  let active = planOpts.upsell_active

  let currentSub = undefined
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i]
    if(sub.name === _plan) {
      currentSub = sub
    }
  }

  let plan = currentSub.plan
  if(active) {
    plan = currentSub.upsell_plan
  }

  let pkey = stripe.pkey
  let cancelUrl = stripe.stripe.cancelUrl
  let successUrl = stripe.stripe.successUrl
  let clientReferenceId = `${uid}|${app}`
  let params = {
    pkey,
    plan,
    cancelUrl,
    successUrl,
    clientReferenceId,
  }
  res.render('redirect', params);
});


router.get('/bak_redirect', function(req, res, next) {
  let uid = req.query.uid
  let app = req.query.app
  let v = req.query.v
  let _plan = req.query.plan
  let plan = stripe.subscription[_plan]
  v = v === '1.0.0' ? '' : v
  if(v){
    plan = stripe.subscription[_plan + `-${v}`]
  }
  if(!plan) {
    plan = stripe.subscription[_plan]
  }
  let pkey = stripe.pkey
  let cancelUrl = stripe.stripe.cancelUrl
  let successUrl = stripe.stripe.successUrl
  let clientReferenceId = `${uid}|${app}`
  let params = {
    pkey,
    plan,
    cancelUrl,
    successUrl,
    clientReferenceId,
  }
  res.render('redirect', params);
});


router.get('/billing', async function(req, res) {
  let customer = req.query.customer
  let session = await stripe.getBillingPortal(customer)
  if(session && session.url){
    let url = session.url
    res.redirect(url)
    return
  }
  res.send('Oops! Something is wrong.')
})

router.post('/billing', async function(req, res) {
  let customer = req.body.customer
  let session = await stripe.getBillingPortal(customer)
  if(session && session.url){
    let url = session.url
    res.send(session)
    return
  }
  res.send(false)
})

module.exports = router;
