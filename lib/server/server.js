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
var async = require('async');
var restify = require('restify');

var log = require('./log.js')('server/server.js');

module.exports = function (userApiClient, dataBroker) {
  function createServer(serverConfig) {
    log.info('Creating server[%s]', serverConfig.name);
    var retVal = restify.createServer(serverConfig);
    retVal.use(restify.queryParser());
    retVal.use(restify.bodyParser());
    retVal.use(restify.gzipResponse());

    var userApiMiddleware = require('user-api-client').middleware;
    var checkToken = userApiMiddleware.checkToken(userApiClient);

    //health check
    retVal.get('/status', function(req, res, next){
      res.send(200);
      next();
    });

    retVal.get('/authorized/group/:user', checkToken, function(req, res, next){});
    retVal.get('/authorized/group/:user', checkToken, function(req, res, next){});
    retVal.get('/authorized/group', checkToken, function(req, res, next){});
    retVal.get('/authorized/:group/:user', checkToken, function(req, res, next){});

    retVal.on('uncaughtException', function(req, res, route, err){
      log.error(err, 'Uncaught exception on route[%s]!', route.spec ? route.spec.path : 'unknown');
      res.send(500);
    });

    return retVal;
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
                cb(err)
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
                cb(err)
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
        throw except.ISE("Gatekeeper must listen on a port to be useful, specify http, https or both.");
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