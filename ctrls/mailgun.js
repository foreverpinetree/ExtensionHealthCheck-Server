// Get access to Parse Server's cache
const ENV = process.env.NODE_ENV;
var config = require("../config-dev.json");
if (ENV === "production") {
  config = require("../config.json");
}

const { AppCache } = require('parse-server/lib/cache');
// Get a reference to the MailgunAdapter
// NOTE: It's best to do this inside the Parse.Cloud.define(...) method body and not at the top of your file with your other imports. This gives Parse Server time to boot, setup cloud code and the email adapter.
const appId = config.appId
const MailgunAdapter = AppCache.get(appId).userController.adapter;
 
class MG {
  constructor () {

  }

  sendTest () {
    // Invoke the send method with an options object
    MailgunAdapter.send({
      templateName: 'customEmailAlert',
      // Optional override of your configuration's subject
      subject: 'Important: action required',
      // Optional override of the adapter's fromAddress
      fromAddress: 'Alerts <no-reply@getwebooster.com>',
      recipient: 'shuhankuang@gmail.com',
      variables: {
        username: 'shuhankuang',
        appName: 'webooster'
      }, 
      // Additional message fields can be included with the "extra" option
      // See https://nodemailer.com/extras/mailcomposer/#e-mail-message-fields for an overview of what can be included
      extra: {
        attachments: [/* include attachment objects */],
        replyTo: 'reply-to-address'
      }
    });
  }
}


let o = new MG()
module.exports = o