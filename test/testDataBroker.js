/*
 * == BSD2 LICENSE ==
 */

'use strict';
/* jshint expr: true */

var _ = require('lodash');
var async = require('async');
var expect = require('salinity').expect;

var dataBroker = require('../lib/dataBroker.js');

describe('dataBroker.js', function () {
  var mongoClient;
  var broker;

  var mockData = [
    {userId: 'bob', groupId: 'theGroup', permissions: { view: {}, upload: { sources: ['carelink'] } }},
    {userId: 'bob', groupId: 'anotherGroup', permissions: { view: {}, root: {} }},
    {userId: 'sally', groupId: 'theGroup', permissions: { view: { messages: false }} }
  ];

  before(function (done) {
    mongoClient = require('../lib/mongo/mongoClient.js')({connectionString: 'mongodb://localhost/gatekeeper_test'});
    broker = dataBroker({secretKey: 'bob'}, mongoClient);

    mongoClient.start(function (err) {
      if (err != null) {
        done(err);
      } else {
        mongoClient.withCollection('perms', done, function (perms, doneCb) {
          perms.deleteMany({}, done);
          doneCb();
        });
      }
    });
  });

  after(function(){
    mongoClient.close();
  });

  function getAllFromPerms(sadCb, happyCb) {
    mongoClient.withCollection('perms', sadCb, function (perms, doneCb) {
      perms.find().toArray(function (err, results) {
        if (err != null) {
          return sadCb(err);
        }
        doneCb();
        happyCb(results);
      });
    });
  }

  it('Adds perms', function (done) {
    async.mapSeries(
      mockData,
      function (entry, cb) {
        broker.setPermissions(entry.userId, entry.groupId, entry.permissions, cb);
      },
      function (err) {
        if (err != null) {
          return done(err);
        }

        getAllFromPerms(done, function (results) {
          expect(results).length(mockData.length);

          for (var i = 0; i < results.length; ++i) {
            expect(results[i]).to.contain.key('groupId').not.equals(mockData[i].groupId);
          }

          var pickFields = _.partialRight(_.pick.bind(_), 'userId', 'permissions');
          var res = results.map(pickFields);
          expect(res).to.deep.equal(mockData.map(pickFields));

          done();
        });
      }
    );
  });

  describe('userInGroup', function(){
    it('Reads perms', function (done) {
      broker.userInGroup('bob', 'theGroup', function (err, perms) {
        expect(perms).to.deep.equal({ view: {}, upload: { sources: ['carelink'] }});
        return done(err);
      });
    });

    it('Returns null when no perms exist', function(done){
      broker.userInGroup('bob', 'no existing group', function(err, perms) {
        expect(perms).to.equal(null);
        return done(err);
      });
    });

    it('Returns root perms for user in own group', function(done){
      broker.userInGroup('bob', 'bob', function(err, perms) {
        expect(perms).to.deep.equal({root: {}});
        return done(err);
      });
    });
  });

  describe('usersInGroup', function(){
    it('Reads users in group', function (done) {
      broker.usersInGroup('theGroup', function (err, users) {
        expect(users).to.deep.equal(
          {
            theGroup: {root: {}},
            bob: { view: {}, upload: { sources: ['carelink'] }},
            sally: { view: { messages: false } }
          }
        );
        done(err);
      });
    });

    it('Includes root permission even for non existing groups', function(done){
      broker.usersInGroup('No existing', function(err, users) {
        expect(users).to.deep.equal({'No existing': {root: {}}});
        return done(err);
      });
    });
  });

  describe('groupsForUser', function(){
    it('Reads groups for user', function (done) {
      broker.groupsForUser('bob', function (err, users) {
        expect(users).to.deep.equal(
          {
            theGroup: { view: {}, upload: { sources: ['carelink'] }},
            anotherGroup: { view: {} },
            bob: {root: {}}
          }
        );
        done(err);
      });
    });
  });

  describe('setPermissions', function(){
    it('Deletes permissions', function(done) {
      broker.setPermissions('bob', 'anotherGroup', null, function(err) {
        expect(err).to.not.exist;
        broker.userInGroup('bob', 'anotherGroup', done);
      });
    });
  });
});
