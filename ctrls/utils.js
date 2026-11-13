const path = require('path')
const ENV = process.env.NODE_ENV
const config = require('../config.json')
const dev_config = require('../config-dev.json')

function getConfig () {
  let con = undefined
  if(ENV === 'production') {
    con = config
  }else {
    if(ENV === 'localhost') { 
      con = dev_config
    }else {
      con = dev_config
    }
  }
  return con
}

module.exports = {
  getConfig
}