const Parse = require("parse/node");
const utils = require('../ctrls/utils');
const defaultConfig = utils.getConfig();

class Proxy {
  constructor(config) {
    config = config || defaultConfig;
    Parse.initialize(config.appId, "", config.masterKey);
    Parse.serverURL = config.serverURL;
    console.log(config.serverURL);
  }

  pointer(klass, id) {
    let p = {
      __type: "Pointer",
      className: klass,
      objectId: id
    };
    return p;
  }

  /**
   * 后去一个对应的数据对象
   * @param {*} klass
   * @param {*} id
   */
  async get(klass, id) {
    let _klass = Parse.Object.extend(klass);
    let query = new Parse.Query(_klass);
    let result = await query.get(id);
    return result;
  }

  /**
   * 强制更新，获取更新后的数据版本
   * @param {*} parseObj
   */
  async fetch(parseObj) {
    let result = await parseObj.fetch();
    return result;
  }

  async create(klass, data, notSava) {
    let _klass = Parse.Object.extend(klass);
    let obj = new _klass(data);
    if (notSava) {
      return obj;
    }
    return await obj.save();
  }

  createEmptyACL () {
    const acl = new Parse.ACL()
    return acl
  }

  async update(parseObj, data) {
    return await parseObj.save(data);
  }

  getQuery(klass) {
    let _klass = Parse.Object.extend(klass);
    let query = new Parse.Query(_klass);
    return query;
  }

  async del(parseObj) {
    return await parseObj.destroy();
  }

  getParse() {
    return Parse;
  }

  currentUser() {
    return Parse.User.current();
  }

  createACL(user, publicRead = false, userCanRead = true, userCanWrite = false) {
    // console.log(user)
    let acl = new Parse.ACL(user);
    acl.setRoleReadAccess("Administrator", true);
    acl.setRoleWriteAccess("Administrator", true);
    acl.setPublicReadAccess(publicRead);
    acl.setWriteAccess(user.id, userCanWrite);
    acl.setReadAccess(user.id, userCanRead);
    return acl
  }
  
}

// let o = new Proxy()
module.exports = function(config) {
  return new Proxy(config);
};