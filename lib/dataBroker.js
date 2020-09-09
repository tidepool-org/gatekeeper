/*
 * == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');
var amoeba = require('amoeba');
var except = amoeba.except;
var pre = amoeba.pre;
var log = require('./log.js')('lib/server.js');

module.exports = function(config, mongoClient) {
  pre.hasProperty(config, 'secretKey');

  function withPerms(sadCb, happyCb) {
    return mongoClient.withCollection('perms', sadCb, happyCb);
  }

  function buildResults(results, key, initialVal, cb) {
    var retVal = _.cloneDeep(initialVal);
    results
      .stream()
      .on('data', function (data) {
        retVal[data[key]] = data.permissions;
      })
      .on('error', cb)
      .on('end', function () {
        cb(null, retVal);
      });
  }

  return {

    userInGroup: function(userId, sharerId, cb) {
      if (userId === sharerId) {
        return process.nextTick(function(){ cb(null, {root: {}}); });
      }

      withPerms(cb, function(perms, doneCb) {
        var retVal = null;

        perms.find({sharerId: sharerId, userId: userId}, {permissions: 1})
          .stream()
          .on('data', function(data){
                if (retVal == null) {
                  retVal = data.permissions;
                } else {
                  cb(except.IAE('Multiple results for sharerId[%s],userId[%s], shouldn\'t happen', sharerId, userId));
                  cb = function(){};
                }
              })
          .on('error', cb)
          .on('end', function(){
            doneCb();
            cb(null, retVal);
          });
      });
    },
    usersInGroup: function(sharerId, cb) {
      var initialVal = {};
      initialVal[sharerId] = {root: {}};

      withPerms(cb, function(perms, doneCb) {
        buildResults(
        perms.find({sharerId: sharerId})
          .project({userId: 1, permissions: 1})
          .sort({userId: 1}),
          'userId', initialVal, cb);
        doneCb();
      });
    },
    groupsForUser: function(userId, cb) {
      var initialVal = {};
      initialVal[userId] = {root: {}};

      withPerms(cb, function(perms, doneCb) {
        buildResults(
        perms
          .find({userId: userId})
          .project({sharerId: 1, permissions: 1})
          .sort({sharerId: 1}),
          'sharerId', initialVal, cb);
        doneCb();
      });
    },
    setPermissions: function(userId, sharerId, permissions, cb) {
      if (userId === sharerId) {
        return process.nextTick(cb);
      }

      if (permissions == null) {
        permissions = {};
      }

      // Silently ignore any attempt to give root priveleges to a user.
      if (permissions.root != null) {
        delete permissions.root;
      }

      withPerms(cb, function(perms, doneCb) {
        if (_.isEmpty(permissions)) {
          perms.deleteMany({ sharerId: sharerId, userId: userId }, function(err, numDeleted){
            doneCb();
            return cb(err);
          });
        } else {
          perms.updateMany(
            { sharerId: sharerId, userId: userId  },
            { $setOnInsert: { sharerId: sharerId, userId: userId },
              $set: { permissions: permissions } },
            { upsert: true },
            cb
          );
          doneCb();
        }
      });
    }
  };
};
