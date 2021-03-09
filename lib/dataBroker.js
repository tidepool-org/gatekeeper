/*
 * == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');

module.exports = function(mongoClient) {
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
        perms.aggregate([
          // Find all user (subject) -> user (principal) permissions
          { $match: {'sharerId': sharerId, 'userId': userId} },
          // Find all user (subject) -> clinic -> clinician (principal) permissions
          { $unionWith:
              {
                coll: 'patient_permissions',
                pipeline: [
                  // Find all patient -> clinic permissions
                  { $match: {'userId': sharerId } },
                  { $lookup: {
                      // Join all clinic -> clinician permissions
                      from: 'clinician_permissions',
                      let: { clinicId: '$clinicId' },
                      as: 'clinician',
                      pipeline: [
                        { $match: {
                            $expr: {
                              $and: [
                                // Join on clinician = userId (principal)
                                { $eq: ['$userId', userId]},
                                { $eq: ['$clinicId','$$clinicId']},
                              ]
                            }
                          }},
                        { $project: { 'clinicianId': '$userId' } },
                      ],
                    }},
                  { $unwind: { path: '$clinician', preserveNullAndEmptyArrays: true } },
                  { $replaceRoot: { newRoot: { $mergeObjects: [ '$clinician', '$$ROOT' ] } } },
                  { $match: { 'clinicianId': { $exists: true } } },
                  { $project: { _id: 0, permissions: 1 } },
                ]
              }
          },
        ]).toArray(function (err, data) {
          if (err != null) {
            cb(err);
            return;
          }

          let permissions = null;
          if (data != null && data.length > 0) {
            permissions = _.map(data, function(p) {
              return p.permissions;
            });
            permissions = _.merge({}, ...permissions);
          }

          doneCb();
          cb(null, permissions);
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
    },
    removePermissionsByUserId: function(userId, cb) {
      withPerms(cb, function(perms, doneCb) {
        perms.deleteMany({ $or: [ { sharerId: userId }, { userId: userId } ] }, function(err, numDeleted){
          doneCb();
          return cb(err);
        });
      });
    }
  };
};
