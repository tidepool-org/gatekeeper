/*
 * == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');
var async = require('async');

module.exports = function(userApiClient, seagullClient, armadaClient, broker) {
  function getMembersOfGroupNamed(userId, group, cb) {
    userApiClient.withServerToken(function (tokenErr, token) {
      if (tokenErr != null) {
        return cb(tokenErr);
      }

      seagullClient.getGroups(userId, token, function (err, groups) {
        if (err != null) {
          return cb(err);
        }

        var viewersGroupId = groups[group];
        if (viewersGroupId == null) {
          return cb(null, null);
        }

        armadaClient.getMembersOfGroup(viewersGroupId, token, function (error, members) {
          if (error != null) {
            return cb(error);
          }

          return cb(null, members.members);
        });
      });
    });
  }

  return {
    userInGroup: function(userId, groupId, cb) {
      async.parallel(
        {
          gatekeeper: broker.userInGroup.bind(broker, userId, groupId),
          legacy: getMembersOfGroupNamed.bind(this, groupId, 'team')
        },
        function(err, results) {
          if (err != null) {
            return cb(err);
          }

          var inGroup = _.contains(results.legacy, userId);

          if (inGroup && (results.gatekeeper == null)) {
            broker.setPermissions(userId, groupId, {view: {}}, function(err) {
              if (err != null) {
                return cb(err);
              }
              return broker.userInGroup(userId, groupId, cb);
            });
          } else {
            return cb(null, results.gatekeeper);
          }
        }
      );
    },
    usersInGroup: function(groupId, cb) {
      async.parallel(
        {
          gatekeeper: broker.usersInGroup.bind(broker, groupId),
          legacy: getMembersOfGroupNamed.bind(this, groupId, 'team')
        },
        function(err, results) {
          if (err != null) {
            return cb(err);
          }

          if (results.legacy == null) {
            results.legacy = [];
          }

          async.map(
            results.legacy,
            function(userId, asyncCb) {
              if (results.gatekeeper[userId] == null) {
                broker.setPermissions(userId, groupId, {view: {}}, asyncCb);
              } else {
                asyncCb(null, 'not updated');
              }
            },
            function(err, results) {
              if (results.every(function(e){ return e === 'not updated'; })) {
                return cb(null, results.gatekeeper);
              }
              broker.usersInGroup(groupId, cb);
            }
          );
        }
      );
    },
    groupsForUser: function(userId, cb) {
      async.parallel(
        {
          gatekeeper: broker.groupsForUser.bind(broker, userId),
          legacy: getMembersOfGroupNamed.bind(this, userId, 'patients')
        },
        function(err, results) {
          if (err != null) {
            return cb(err);
          }

          if (results.legacy == null) {
            results.legacy = [];
          }

          async.map(
            Object.keys(results.legacy),
            function(groupId, asyncCb) {
              if (results.gatekeeper[userId] == null) {
                broker.setPermissions(userId, groupId, results.legacy[userId], asyncCb);
              } else {
                asyncCb(null, 'not updated');
              }
            },
            function(err) {
              if (results.every(function(e){ return e === 'not updated'; })) {
                return cb(null, results.gatekeeper);
              }
              broker.groupsForUser(groupId, cb);
            }
          );
        }
      );
    },
    setPermissions: broker.setPermissions.bind(broker)
  };
};