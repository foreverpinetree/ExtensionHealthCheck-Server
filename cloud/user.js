Parse.Cloud.afterSave(Parse.User, async req => {
  console.log("hook user");
  if (!req.object.get("inited")) {
    // asset acl
    console.log("update");
    let acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setRoleReadAccess("Administrator", true);
    acl.setRoleWriteAccess("Administrator", true);
    acl.setWriteAccess(req.object.id, false);
    acl.setReadAccess(req.object.id, true);
    req.object.setACL(acl);
    req.object.set("inited", 1);
    req.object.save(null, { useMasterKey: true });
  }
});
