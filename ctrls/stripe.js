const ENV = process.env.NODE_ENV
let stripe_config, config, proxy
// env
if(ENV === 'production'){
  stripe_config = require('../stripe.json')
  config = require('../config.json')
}else{
  stripe_config = require('../stripe-dev.json')
  config = require('../config-dev.json')
}
// parse server api
proxy = require('../ctrls/proxy')(config)
// stripe arguments
const STRIPE = stripe_config.stripe
const PKEY = stripe_config.stripe.pkey
const SKEY = stripe_config.stripe.skey
const PORTAL_RETURN_URL = stripe_config.stripe.portalReturnUrl
const SUBSCRIPTIONS = stripe_config.subscriptions
// stripe sdk
const stripe = require('stripe')(SKEY)

class Stripe {
  constructor () {
    this.pkey = PKEY
    // this.subscription = SUBSCRIPTION
    this.stripe = STRIPE
  }

  async getBillingPortal (customer) {
    // console.log(customer)
    const session = await stripe.billingPortal.sessions.create({
      customer: customer,
      return_url: PORTAL_RETURN_URL});
    return session
  }

  /**
   * 获取当前的订阅价格参数
   * @param {*} uid 用户的 id
   * @returns 
   */
  async fetchPlanOptions (uid, withPlanId) {
    // 获取价格的参数
    let q = proxy.getQuery(Parse.User)
    let user = await q.get(uid, {useMasterKey: true})
    let upsell = stripe_config.upsell
    let text = upsell.text
    let time = upsell.time
    let only_show_text = upsell.only_show_text
    let current = Math.round(new Date().getTime() / 1000)
    let start = Math.round(new Date(user.get('createdAt')).getTime() / 1000)
    let end = start + Number(time)
    let upsell_active = end > current

    let subscriptions = SUBSCRIPTIONS
    let subs = []
    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i]
      let price = `${sub.price}`
      if(upsell_active) {
        price = `${sub.upsell_price}&nbsp;<del style="font-size: 20px; color: grey;">${sub.price}</del>`
      }
      subs.push({
        "name": sub.name,
        "price": sub.price,
        "upsell_price": price,
        "plan": withPlanId ? sub.plan  : undefined, // 原价订阅的 Id,
        "upsell_plan": withPlanId ? sub.upsell_plan  : undefined // 优惠内订阅的 Id
      })
    }

    let opts =  {text, only_show_text, time, current, start, end, upsell_active, subs}
    // 前端在 Pro.vue 文件里对应参数
    return opts
  }
}


let o = new Stripe()
module.exports = o