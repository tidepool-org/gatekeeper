/*
 * == BSD2 LICENSE ==
 */

var crypto = require('crypto');

var amoeba = require('amoeba');
var except = amoeba.except;
var pre = amoeba.pre;

var ALGORITHM = 'AES256';

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
      results
        .stream()
        .on('data', function (data) {
              retVal[conversionFn(data[key])] = data.permissions;
            })
        .on('error', cb)
        .on('end', function () {
              cb(null, retVal);
            });
    }
  }

  function decrypt(string) {
    var decipher = crypto.createDecipher(ALGORITHM, config.secretKey);
    decipher.write(new Buffer(string, 'base64'));
    decipher.end();
    return decipher.read();
  }

  function encrypt(string) {
    var cipher = crypto.createCipher(ALGORITHM, config.secretKey);
    cipher.write(string);
    cipher.end();
    return cipher.read().toString('base64');
  }

  return {
    userInGroup: function(userId, groupId, cb) {
      groupId = encrypt(groupId);

      withPerms(cb, function(perms) {
        var retVal = null;

        perms.find({groupId: groupId, userId: userId}, {permissions: 1})
          .stream()
          .on('data', function(data){
                if (retVal == null) {
                  retVal = data.permissions;
                } else {
                  cb(except.IAE('Multiple results for groupId[%s],userId[%s], shouldn\'t happen', groupId, userId));
                  cb = function(){};
                }
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
        perms.find({groupId: groupId}, {userId: 1, permissions: 1})
          .sort({userId: 1}, buildResults('userId', cb))
      });
    },
    groupsForUser: function(userId, cb) {
      withPerms(cb, function(perms) {
        perms
          .find({userId: userId}, {groupId: 1, permissions: 1})
          .sort({groupId: 1}, buildResults('groupId', cb));
      });
    },
    setPermissions: function(userId, groupId, permissions, cb) {
      groupId = encrypt(groupId);

      withPerms(cb, function(perms) {
        perms.update(
          { groupId: groupId, userId: userId },
          { $setOnInsert: { groupId: groupId, userId: userId },
            $set: { permissions: permissions } },
          { upsert: true },
          cb
        );
      });
    }
  }
};