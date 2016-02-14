#!/bin/bash -eu

./node_modules/.bin/jshint *.js lib/*.js lib/mongo/*.js test/*.js 
npm test
