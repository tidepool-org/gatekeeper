// Loads the environment and makes it accessible,
// and also has sensible defaults

// == BSD2 LICENSE ==
// Copyright (c) 2014, Tidepool Project
//
// This program is free software; you can redistribute it and/or modify it under
// the terms of the associated License, which is identical to the BSD 2-Clause
// License as published by the Open Source Initiative at opensource.org.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the License for more details.
//
// You should have received a copy of the License along with this program; if
// not, you can obtain one from Tidepool Project at tidepool.org.
// == BSD2 LICENSE ==

'use strict';

var fs = require('fs');

var config = require('amoeba').config;
var cs = require('amoeba').toConnectionString;

function maybeReplaceWithContentsOfFile(obj, field)
{
  var potentialFile = obj[field];
  if (potentialFile != null && fs.existsSync(potentialFile)) {
    obj[field] = fs.readFileSync(potentialFile).toString();
  }
}

module.exports = (function() {
  var env = {};

  // The port to attach an HTTP listener, if null, no HTTP listener will be attached
  env.httpPort = config.fromEnvironment('PORT', null);

  // The port to attach an HTTPS listener, if null, no HTTPS listener will be attached
  env.httpsPort = config.fromEnvironment('HTTPS_PORT', null);

  // The https config to pass along to https.createServer.
  var theConfig = config.fromEnvironment('HTTPS_CONFIG', null);
  env.httpsConfig = null;
  if (theConfig != null) {
    env.httpsConfig = JSON.parse(theConfig);
    maybeReplaceWithContentsOfFile(env.httpsConfig, 'key');
    maybeReplaceWithContentsOfFile(env.httpsConfig, 'cert');
    maybeReplaceWithContentsOfFile(env.httpsConfig, 'pfx');
  }
  if (env.httpsPort != null && env.httpsConfig == null) {
    throw new Error('No https config provided, please set HTTPS_CONFIG with at least the certificate to use.');
  }

  if (env.httpPort == null && env.httpsPort == null) {
    throw new Error('Must specify either PORT or HTTPS_PORT in your environment.');
  }

  env.mongo = {
    connectionString: cs('gatekeeper') 
  }

  env.userApi = {
    // The config object to discover user-api.  This is just passed through to hakken.watchFromConfig()
    serviceSpec: JSON.parse(config.fromEnvironment('USER_API_SERVICE')),

    // Name of this server to pass to user-api when getting a server token
    serverName: config.fromEnvironment('SERVER_NAME', 'gatekeeper'),

    // The secret to use when getting a server token from user-api
    serverSecret: config.fromEnvironment('SERVER_SECRET')
  };

  env.gatekeeper = {
    secretKey: config.fromEnvironment('GATEKEEPER_SECRET')
  };

  env.discovery = {
    // The host to connect to for discovery
    host: config.fromEnvironment('DISCOVERY_HOST'),
    skipHakken: config.fromEnvironment('SKIP_HAKKEN', false)
  };

  // The service name to publish on discovery
  env.serviceName = config.fromEnvironment('SERVICE_NAME', 'gatekeeper');

  // The local host to publish to discovery
  env.publishHost = config.fromEnvironment('PUBLISH_HOST');

  return env;
})();
