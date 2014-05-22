/*
 * == BSD2 LICENSE ==
 */

'use strict';
/* jshint expr: true */


var salinity = require('salinity');

var expect = salinity.expect;
var mockableObject = salinity.mockableObject;
var sinon = salinity.sinon;

describe('server.js', function(){
  var userApiClient = mockableObject.make('checkToken');
  var dataBroker = mockableObject.make('userInGroup', 'usersInGroup', 'groupsForUser', 'setPermissions');
  var server = require('../lib/server.js')(userApiClient, dataBroker);

  var token = 'tokenTextHere';
  var tokenGetter = function(cb){ return cb(null, token); };
  var hostGetter = { get: function(){ return [{protocol: 'http', host: 'localhost:12345'}]; } };
  var client = require('tidepool-gatekeeper').client(require('amoeba').httpClient(), tokenGetter, hostGetter);

  before(function(done){
    server.withHttp(12345, done);
    server.start();
  });

  after(function(){
    server.close();
  });

  beforeEach(function(){
    mockableObject.reset(userApiClient, dataBroker);
  });

  function expectTokenCheck(err, payload) {
    sinon.stub(userApiClient, 'checkToken').callsArgWith(1, err, payload);
    return function() {
      expect(userApiClient.checkToken).to.have.been.calledWith(token, sinon.match.func);
    };
  }

  describe('/access/groups/:userId', function(){
    it('allows a user to see their own info', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, null, {user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});

      client.groupsForUser('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});
        expect(dataBroker.groupsForUser).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows a server to see anyone\'s info', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2', isserver: true });
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, null, {user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});

      client.groupsForUser('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});
        expect(dataBroker.groupsForUser).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('always exists in own group', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, null, {user1: {root: {}}});

      client.groupsForUser('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}});
        expect(dataBroker.groupsForUser).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('rejects other people from seeing anyone\'s info', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });

      client.groupsForUser('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 401, message: 'Try the speakeasy down the street.' });
        expect(result).to.not.exist;
        userExpectations();
        return done();
      });
    });

    it('errors on error', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, new Error('MarsAndVenus'));

      client.groupsForUser('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.groupsForUser).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('errors on error as a new test', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, new Error('MarsAndVenus'));

      client.groupsForUser('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.groupsForUser).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done();
      });
    });
  });


  describe('/access/:groupId', function(){
    it('allows a user to see their own group', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, {user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});

      client.usersInGroup('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});
        expect(dataBroker.usersInGroup).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows a server to see any group\'s info', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2', isserver: true });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, {user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});

      client.usersInGroup('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});
        expect(dataBroker.usersInGroup).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('always exists in own group', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, {user1: {root: {}}});

      client.usersInGroup('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}});
        expect(dataBroker.usersInGroup).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('rejects other people from seeing a group\'s info', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });

      client.usersInGroup('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 401, message: 'These are not the droids you are looking for.' });
        expect(result).to.not.exist;
        userExpectations();
        return done();
      });
    });

    it('errors on error', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, new Error('MarsAndVenus'));

      client.usersInGroup('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.usersInGroup).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done();
      });
    });
  });

  describe('/access/:groupId/:userId', function(){
    it('passes the happy path', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, {view: {}});

      client.userInGroup('user1', 'groupA', function(err, result){
        expect(result).to.deep.equal({ view: {} });
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('rejects people who aren\'t the user or the group, or in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, { user3: { view: {} }});

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.not.exist;
        expect(dataBroker.usersInGroup).to.have.been.calledWith('groupA', sinon.match.func);
        userExpectations();
        expect(err).to.deep.equal({ statusCode: 401, message: 'They went thattaway!'});
        return done();
      });
    });

    it('rejects other users in the group without the admin permission', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, { user3: {view: {}}, user1: {view: {}}});

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.not.exist;
        expect(dataBroker.usersInGroup).to.have.been.calledWith('groupA', sinon.match.func);
        userExpectations();
        expect(err).to.deep.equal({ statusCode: 401, message: 'They went thattaway!'});
        return done();
      });
    });

    it('allows other users in the group with the admin permission', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, { user3: {view: {}}, user1: {admin: {}}});

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.equal(null);
        expect(dataBroker.usersInGroup).to.have.been.calledWith('groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows users to check on its own status in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, null);

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.equal(null);
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('doesn\'t leak information to users checking on their own status in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, null);

      client.userInGroup('user2', 'no existing group', function(err, result){
        expect(result).to.equal(null);
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'no existing group', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows a user to check on the status of its own group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, {view: {}});

      client.userInGroup('user2', 'user1', function(err, result){
        expect(result).to.deep.equal({view: {}});
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows a server to check on the status of anything', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1', isserver: true });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, {view: {}});

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.deep.equal({view: {}});
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('a user should always have permissions over their own group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1', isserver: true });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, {root: {}});

      client.userInGroup('user2', 'user2', function(err, result){
        expect(result).to.deep.equal({root: {}});
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user2', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('errors on error', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1', isserver: true });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, new Error('whatsamatta'));

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'groupA', sinon.match.func);
        userExpectations();
        return done();
      });
    });
  });
});