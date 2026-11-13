// const Pay = require('../ctrls/pay')
// 判断是否付费用户
const pay_config = require("../pay-config.json");
const fs = require("fs");
const path = require("path");
// const stripe = require('../ctrls/stripe')

const ENV = process.env.NODE_ENV;
var config = require("../config-dev.json");
if (ENV === "production") {
	config = require("../config.json");
}

const APP_NAME = config.app;

//const proxy = require("../ctrls/proxy")(config);
//const Mailgun = require("../ctrls/mailgun");
// const stripe = require('../ctrls/stripe')
//const paddle = require("../ctrls/paddle");