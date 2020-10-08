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

'use strict';

var logMaker = require('./lib/log.js');

var events = require('./lib/events.js');

(async function () {
  var config = require('./env.js');
  var amoeba = require('amoeba');
  var lifecycle = amoeba.lifecycle();

  var getter = {
    get: function() { return [{'protocol': 'http', 'host': config.userApi.userService}]; }
  };

  var userApiClient = require('user-api-client').client( config.userApi, getter );

  var mongoClient = lifecycle.add('mongoClient', require('./lib/mongo/mongoClient.js')(config.mongo));

  var dataBroker = require('./lib/dataBroker.js')(mongoClient);

  const eventsLogger = logMaker('lib/events.js');
  const eventsConfig = amoeba.events.loadConfigFromEnv();
  const userEventsHandler = events.createUserEventsHandler(dataBroker, eventsLogger);
  const consumer = await amoeba.events.createEventConsumer(eventsConfig, userEventsHandler, eventsLogger);

  lifecycle.add('eventConsumer', {
    start: function() {
      consumer.start();
    },
    close: function() {
      consumer.close();
    },
  });


  var server = require('./lib/server.js')(userApiClient, dataBroker);

  if (config.httpPort != null) {
    server.withHttp(config.httpPort);
  }
  if (config.httpsPort != null) {
    server.withHttps(config.httpsPort, config.httpsConfig);
  }
  lifecycle.add('server', server);
  lifecycle.start();
  lifecycle.join();
})();
