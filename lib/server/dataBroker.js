/*
 * == BSD2 LICENSE ==
 */

var pre = require('amoeba').pre;

module.exports = function(config, mongoClient) {
  pre.hasProperty(config, 'secretKey');

  function withPerms(sadCb, happyCb) {
    return mongoClient.withCollection('perms', sadCb, happyCb);
  }

  function buildResults(key, cb) {
    var conversionFn;
    if (key === 'groupId') {
      conversionFn = decrypt
    } else {
      conversionFn = function(e){ return e; };
    }

    return function(err, results) {
      if (err != null) {
        return cb(err);
      }

      var retVal = {};
      var currObj = null;
      var currKey = null;
      results
        .stream()
        .on('data', function (data) {
              if (data[key] !== currKey) {
                if (currObj != null) {
                  retVal[conversionFn(currKey)] = currObj;
                }

                currKey = data[key];
                currObj = {};
              }

              currObj[data.permission] = data.payload;
            })
        .on('error', cb)
        .on('end', function () {
              retVal[conversionFn(currKey)] = currObj;
              cb(null, retVal);
            });
    }
  }

  function decrypt(string) {
    return string;
  }

  function encrypt(string) {
    return string;
  }

  return {
    userInGroup: function(userId, groupId, cb) {
      groupId = encrypt(groupId);

      withPerms(cb, function(perms) {
        var retVal = {};

        perms.find({groupId: groupId, userId: userId}, {permission: 1, payload: 1})
          .stream()
          .on('data', function(data){
                retVal[data.permission] = data.payload;
              })
          .on('error', cb)
          .on('end', function(){
                cb(null, retVal);
              });
      });
    },
    usersInGroup: function(groupId, cb) {
      groupId = encrypt(groupId);

      withPerms(cb, function(perms) {
        perms.find({groupId: groupId}, {userId: 1, permission: 1, payload: 1})
          .sort({userId: 1}, buildResults('userId', cb))
      });
    },
    groupsForUser: function(userId, cb) {
      withPerms(cb, function(perms) {
        perms
          .find({userId: userId}, {groupId: 1, permission: 1, payload: 1})
          .sort({groupId: 1}, buildResults('groupId', cb));
      });
    },
    addPermission: function(userId, groupId, permission, payload, cb) {
      groupId = encrypt(groupId);

      withPerms(cb, function(perms) {
        perms.update(
          { groupId: groupId, userId: userId, permission: permission },
          { $setOnInsert: { groupId: groupId, userId: userId, permission: permission },
            $set: { payload: payload } },
          { upsert: true },
          cb
        );
      });
    }
  }
};