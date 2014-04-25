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

    retVal.get('/permissions/group/:userId', checkToken, function(req, res, next){
      var tokendata = req._tokendata;
      if (tokendata.isserver || req.params.userId === tokendata.userid) {
        return dataBroker.groupsForUser(req.params.userId, resultsCb(req, res, next));
      } else {
        res.send(401, 'Try the speakeasy down the street.');
        return next();
      }
    });

    retVal.get('/permissions/:groupId', checkToken, function(req, res, next){
      var tokendata = req._tokendata;
      if (!tokendata.isserver && req.params.groupId !== tokendata.userid) {
        res.send(401, 'These are not the droids you are looking for.');
        return next();
      }

      dataBroker.usersInGroup(req.params.groupId, resultsCb(req, res, next));
    });

    retVal.get('/permissions/:groupId/:userId', checkToken, function(req, res, next){
      var tokendata = req._tokendata;
      if (tokendata.isserver || req.params.groupId === tokendata.userid || req.params.userId === tokendata.userid) {
        dataBroker.userInGroup(req.params.userId, req.params.groupId, resultsCb(req, res, next));
      } else {
        dataBroker.usersInGroup(req.params.groupId, function(err, results){
          if (err != null) {
            log.info(err, 'Error on checking usersInGroup[%s]', req.params.groupId);
            res.send(500);
            return next();
          }

          if (results[tokendata.userid] == null || results[tokendata.userid].admin == null) {
            res.send(401, 'They went thattaway!');
            return next();
          }

          var retVal = results[req.params.userId];
          if (retVal == null) {
            res.send(404);
          } else {
            res.send(200, retVal);
          }
          return next();
        });
      }
    });
    retVal.post('/permissions/:groupId/:userId', checkToken, function(req, res, next){
      var tokendata = req._tokendata;

      function doIt() {
        var cb = resultsCb(req, res, next);
        dataBroker.setPermissions(req.params.userId, req.params.groupId, req.body, function(err){
          if (err != null) {
            return cb(err);
          } else {
            dataBroker.userInGroup(req.params.userId, req.params.groupId, cb);
          }
        });
      }

      if (tokendata.isserver || req.params.groupId === tokendata.userid || req.params.userId === tokendata.userid) {
        doIt();
      } else {
        dataBroker.userInGroup(tokendata.userid, req.params.groupId, function(err, results) {
          if (err != null) {
            log.info(err, 'Error on checking userInGroup[%s]', req.params.groupId);
            res.send(500);
            return next();
          }

          if (results == null || results.adming == null) {
            res.send(401, 'Nope nope nope');
            return next();
          }

          doIt();
        });
      }
    });

    retVal.on('uncaughtException', function(req, res, route, err) {
      log.error(err, 'Uncaught exception on route[%s]!', route.spec == null ? 'unknown' : route.spec.path);
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