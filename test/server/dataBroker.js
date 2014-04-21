/*
 * == BSD2 LICENSE ==
 */

var _ = require('lodash');
var async = require('async');
var expect = require('salinity').expect;

var dataBroker = require('../../lib/server/dataBroker.js');

describe('dataBroker.js', function(){
  var mongoClient;
  var broker;

  var mockData = [
    {userId: 'bob', groupId: 'theGroup', permissions: { view: {}, upload: { sources: ['carelink'] } }},
    {userId: 'bob', groupId: 'anotherGroup', permissions: { view: {} }},
    {userId: 'sally', groupId: 'theGroup', permissions: { view: { messages: false }} }
  ];

  before(function(done){
    mongoClient = require('../../lib/mongo/mongoClient.js')({connectionString: 'mongodb://localhost/gatesBrokerTest'});
    broker = dataBroker({secretKey: 'bob'}, mongoClient);

    mongoClient.start(function(err){
      if (err != null) {
        done(err);
      } else {
        mongoClient.withCollection('perms', done, function(perms) {
          perms.remove(done);
        });
      }
    });
  });

  function getAllFromPerms(sadCb, happyCb) {
    mongoClient.withCollection('perms', sadCb, function(perms){
      perms.find().toArray(function(err, results) {
        if (err != null) {
          return sadCb(err);
        }
        happyCb(results);
      });
    });
  }

  it('Adds perms', function(done) {
    async.mapSeries(
      mockData,
      function(entry, cb) {
        broker.setPermissions(entry.userId, entry.groupId, entry.permissions, cb);
      },
      function(err) {
        if (err != null) {
          return done(err);
        }

        getAllFromPerms(done, function(results){
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

  it ('Reads perms', function(done) {
    broker.userInGroup('bob', 'theGroup', function(err, perms) {
      if (err != null) {
        return done(err);
      }

      expect(perms).to.deep.equal({ view: {}, upload: { sources: ['carelink'] }});
      done();
    });
  });

  it ('Reads users in group', function(done) {
    broker.usersInGroup('theGroup', function(err, users) {
      if (err != null) {
        return done(err);
      }

      expect(users).to.deep.equal(
        {
          bob: { view: {}, upload: { sources: ['carelink'] }},
          sally: { view: { messages: false } }
        }
      );
      done();
    });
  });

  it ('Reads groups for user', function(done) {
    broker.groupsForUser('bob', function(err, users) {
      if (err != null) {
        return done(err);
      }

      expect(users).to.deep.equal(
        {
          theGroup: { view: {}, upload: { sources: ['carelink'] }},
          anotherGroup: { view: {} }
        }
      );
      done();
    });
  });
});