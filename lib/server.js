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
var restify = require('restify');
var errors = require('restify-errors');
var log = require('./log.js')('lib/server.js');

const { createTerminus } = require('@godaddy/terminus');

function resultsCb(request, response, next) {
  return function (err, results) {
    if (err != null) {
      log.info(err, 'Error on url[%s]', request.url);
      response.send(500);
      return next(false);
    } else if (results == null) {
      return next(new errors.NotFoundError());
    }
    response.send(200, results);
    return next();
  };
}

function createServer(serverConfig, userApiClient, dataBroker) {
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
if (error) {
        permissions.errorResponse(error, res, next);
} else {
        dataBroker.userInGroup(req.params.granteeid, req.params.userid, function(error, result) {
          if (error) {
            permissions.errorResponse(error, res, next);
    } else {
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


module.exports = function(config, userApiClient, dataBroker, kafkaConsumer, mongoClient) {

  var server, servicePort;
  //create the server depending on the type
  if (config.httpPort != null) {
    servicePort = config.httpPort;
    server = createServer(
      { name: 'GatekeeperHttp' },
      userApiClient,
      dataBroker
    );
  }
  else if (config.httpsPort != null) {
    servicePort = config.httpsPort;
    server = createServer(
      _.extend({ name: 'GatekeeperHttp'}, config.httpsConfig),
      userApiClient,
      dataBroker
    );
  }

  function beforeShutdown() {
    // avoid running into any race conditions
    // https://github.com/godaddy/terminus#how-to-set-terminus-up-with-kubernetes
    return new Promise(resolve => setTimeout(resolve, 5000));
  }

  async function onShutdown() {
    log.info('Stopping the Message API server');
    server.close();
    log.info('Stopping the Kafka producer');
    await kafkaConsumer.stop();
    log.info('Closing Mongo connection');
    mongoClient.close();
    return;
  }

  async function status() {
    return;
  }

  return {
    onShutdown,
    start: function (cb) {
      log.info('Starting Mongo connection');
      mongoClient.start();
      log.info('Starting the Kafka consumer');
      kafkaConsumer.start();
      createTerminus(server.server, {
        healthChecks: {
          '/status': status,
          '/access/status': status
        },
        beforeShutdown,
        onShutdown,
      });
      log.info('Starting Gatekeeper API server serving on port[%s]', servicePort);
      server.listen(servicePort, cb);
    }
  };
};
