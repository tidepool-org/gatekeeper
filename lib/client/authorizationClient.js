/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 * 
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 * 
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

var _ = require('lodash');

module.exports = function(userApiClient, seagullClient, armadaClient) {
  return {
    canViewData: function(userId, patientId, cb) {
      if (userId === patientId) {
        return process.nextTick(function(){
          cb(null, true);
        });
      }

      userApiClient.withServerToken(function(tokenErr, token){
        if (tokenErr != null) {
          return cb(tokenErr);
        }

        seagullClient.getGroups(patientId, token, function(err, groups){
          if (err != null) {
            return cb(err);
          }

          var viewersGroupId = groups.team;
          if (viewersGroupId == null) {
            return cb(null, false);
          }

          armadaClient.getMembersOfGroup(viewersGroupId, token, function(error, members){
            if (error != null) {
              return cb(error);
            }

            return cb(null, _.contains(members.members, userId));
          });
        });
      });
    }
  }
};