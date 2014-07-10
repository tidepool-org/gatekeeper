/*
 * Copyright (c) 2014, Tidepool Project
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this
 * list of conditions and the following disclaimer in the documentation and/or other
 * materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 * NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

var _ = require('lodash');

var log = require('./lib/log.js')('index.js');

(function () {
  var config = require('./env.js');
  var amoeba = require('amoeba');
  var lifecycle = amoeba.lifecycle();
  var hakken = lifecycle.add('hakken', require('hakken')(config.discovery, log).client());

  var httpClient = amoeba.httpClient();

  var userApiClient = require('user-api-client').client(
    config.userApi,
    lifecycle.add('user-api-watch', hakken.watchFromConfig(config.userApi.serviceSpec))
  );

  var seagullClient = require('tidepool-seagull-client')(
    lifecycle.add('seagull-watch', hakken.watchFromConfig(config.seagull.serviceSpec)), {}, httpClient
  );

  var armadaClient = require('tidepool-armada-client')(
    lifecycle.add('armada-watch', hakken.watchFromConfig(config.armada.serviceSpec))
  );

  var mongoClient = lifecycle.add('mongoClient', require('./lib/mongo/mongoClient.js')(config.mongo));
  var dataBroker = require('./lib/dataBroker.js')(config.gatekeeper, mongoClient);

  var server = require('./lib/server.js')(userApiClient, dataBroker);

  if (config.httpPort != null) {
    server.withHttp(config.httpPort);
  }
  if (config.httpsPort != null) {
    server.withHttps(config.httpsPort, config.httpsConfig);
  }
  lifecycle.add('server', server);

  lifecycle.add(
    'servicePublish!',
    {
      start: function(cb) {
        var serviceDescriptor = { service: config.serviceName };
        if (config.httpsPort != null) {
          serviceDescriptor.host = config.publishHost + ':' + config.httpsPort;
          serviceDescriptor.protocol = 'https';
        } else if (config.httpPort != null) {
          serviceDescriptor.host = config.publishHost + ':' + config.httpPort;
          serviceDescriptor.protocol = 'http';
        }

        log.info('Publishing service[%j]', serviceDescriptor);
        hakken.publish(serviceDescriptor);

        if (cb != null) {
          cb();
        }
      },
      close: function(cb) {
        if (cb!= null) {
          cb();
        }
      }
    }
  );

  lifecycle.start();
  lifecycle.join();
})();