/*
 == BSD2 LICENSE ==
 Copyright (c) 2014, Tidepool Project

 This program is free software; you can redistribute it and/or modify it under
 the terms of the associated License, which is identical to the BSD 2-Clause
 License as published by the Open Source Initiative at opensource.org.

 This program is distributed in the hope that it will be useful, but WITHOUT
 ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 FOR A PARTICULAR PURPOSE. See the License for more details.

 You should have received a copy of the License along with this program; if
 not, you can obtain one from Tidepool Project at tidepool.org.
 == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');
var except = require('amoeba').except;
var restify = require('restify');

var log = require('./log.js')('lib/server.js');

function resultsCb(request, response, next) {
  return function (err, results) {
    if (err != null) {
      log.info(err, 'Error on url[%s]', request.url);
      response.send(500);
    } else if (results == null) {
      response.send(404);
    } else {
      response.send(200, results);
    }

    next();
  };
}

module.exports = function (userApiClient, dataBroker) {
  function createServer(serverConfig) {
    log.info('Creating server[%s]', serverConfig.name);
    var app = restify.createServer(serverConfig);
    app.use(restify.plugins.queryParser());
    app.use(restify.plugins.bodyParser());
    app.use(restify.plugins.gzipResponse());

    var userApiMiddleware = require('user-api-client').middleware;
    var checkToken = userApiMiddleware.checkToken(userApiClient);
    var permissions = require('amoeba').permissions(dataBroker);

    var requireReadPermissions = function(req, res, next) {
      permissions.requireUser(req, res, next, function(req, res, next) {
        if (permissions.hasUserPermissions(req._tokendata.userid, req.params.granteeid)) {
          return next();
        }
        permissions.hasCheckedPermissions(req._tokendata.userid, req.params.userid, function(result) {
          return result.admin != null || result.custodian != null;
        }, function(error, success) {
          permissions.handleResponse(error, success, req, res, next);
        });
      });
    };

    var requireCustodian = function(req, res, next) {
      permissions.requireCustodian(req, res, next);
    };

    var normalizePermissionsBody = function(req, res, next) {
      if (Buffer.isBuffer(req.body) && req.body.length === 0) {
        req.body = {};
      }
      next();
    };

    var requireWritePermissions = function(req, res, next) {
      permissions.requireUser(req, res, next, function(req, res, next) {
        permissions.hasCheckedPermissions(req._tokendata.userid, req.params.userid, function(result) {
          return result.admin != null || result.custodian != null || (!_.isEmpty(result) && _.isEmpty(req.body));
        }, function(error, success) {
          permissions.handleResponse(error, success, req, res, next);
        });
      });
    };

    //health check
    app.get('/status', function(req, res, next){
      res.send(200);
      next();
    });

    app.get('/access/status', function(req, res, next){
      res.send(200);
      next();
    });

    app.get('/access/groups/:userid', checkToken, requireCustodian, function(req, res, next) {
      dataBroker.groupsForUser(req.params.userid, resultsCb(req, res, next));
    });

    app.get('/access/:userid', checkToken, requireCustodian, function(req, res, next) {
      dataBroker.usersInGroup(req.params.userid, resultsCb(req, res, next));
    });

    app.get('/access/:userid/:granteeid', checkToken, requireReadPermissions, function(req, res, next) {
      dataBroker.userInGroup(req.params.granteeid, req.params.userid, resultsCb(req, res, next));
    });

    app.post('/access/:userid/:granteeid', checkToken, normalizePermissionsBody, requireWritePermissions, function(req, res, next) {
      dataBroker.setPermissions(req.params.granteeid, req.params.userid, req.body, function(error) {
        if (!permissions.errorResponse(error, res, next)) {
          dataBroker.userInGroup(req.params.granteeid, req.params.userid, function(error, result) {
            if (!permissions.errorResponse(error, res, next)) {
              permissions.successResponse(200, result, res, next);
            }
          });
        }
      });
    });

    app.on('uncaughtException', function(req, res, route, err) {
      log.error(err, 'Uncaught exception on route[%s]!', route.spec == null ? 'unknown' : route.spec.path);
      res.send(500);
    });

    return app;
  }

  var objectsToManage = [];
  return {
    withHttp: function(port, cb){
      var server = createServer({ name: 'GatekeeperHttp' });
      objectsToManage.push(
        {
          start: function(){
            server.listen(port, function(err){
              if (err == null) {
                log.info('Http server listening on port[%s]', port);
              }
              if (cb != null) {
                cb(err);
              }
            });
          },
          close: server.close.bind(server)
        }
      );
      return this;
    },
    withHttps: function(port, config, cb){
      var server = createServer(_.extend({ name: 'GatekeeperHttps' }, config));
      objectsToManage.push(
        {
          start: function(){
            server.listen(port, function(err){
              if (err == null) {
                log.info('Https server listening on port[%s]', port);
              }
              if (cb != null) {
                cb(err);
              }
            });
          },
          close: server.close.bind(server)
        }
      );
      return this;
    },
    start: function() {
      if (objectsToManage.length < 1) {
        throw except.ISE('Gatekeeper must listen on a port to be useful, specify http, https or both.');
      }

      objectsToManage.forEach(function(obj){ obj.start(); });
      return this;
    },
    close: function() {
      objectsToManage.forEach(function(obj){ obj.close(); });
      return this;
    }
  };
};
