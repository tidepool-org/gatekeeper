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

  describe('GET /access/groups/:userid', function(){
    it('allows a server to see any user info', function(done){
      var userExpectations = expectTokenCheck(null, { isserver: true });
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, null, {user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});

      client.groupsForUser('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});
        expect(dataBroker.groupsForUser).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

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

    it('allows a custodian to see the user info they are a custodian of', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').withArgs('user2', 'user1').callsArgWith(2, null, {'custodian': {}});
      sinon.stub(dataBroker, 'groupsForUser').callsArgWith(1, null, {user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});

      client.groupsForUser('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, groupA: {view: {}}, groupB: {admin: {}}});
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user1', sinon.match.func);
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
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2);

      client.groupsForUser('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized' });
        expect(result).to.not.exist;
        userExpectations();
        return done();
      });
    });

    it('errors on error from userInGroup', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').withArgs('user2', 'user1').callsArgWith(2, new Error('MarsAndVenus'));

      client.groupsForUser('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user1', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('errors on error from groupsForUser', function(done){
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


  describe('GET /access/:userid', function(){
    it('allows a server to see any user info', function(done){
      var userExpectations = expectTokenCheck(null, { isserver: true });
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, {user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});

      client.usersInGroup('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});
        expect(dataBroker.usersInGroup).to.have.been.calledWith('user1', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

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

    it('allows a custodian to see the user info they are a custodian of', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').withArgs('user2', 'user1').callsArgWith(2, null, {'custodian': {}});
      sinon.stub(dataBroker, 'usersInGroup').callsArgWith(1, null, {user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});

      client.usersInGroup('user1', function(err, result) {
        expect(result).to.deep.equal({user1: {root: {}}, user2: {view: {}}, user3: {admin: {}}});
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user1', sinon.match.func);
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
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2);

      client.usersInGroup('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized' });
        expect(result).to.not.exist;
        userExpectations();
        return done();
      });
    });

    it('errors on error from userInGroup', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').withArgs('user2', 'user1').callsArgWith(2, new Error('MarsAndVenus'));

      client.usersInGroup('user1', function(err, result) {
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user1', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('errors on error from groupsForUser', function(done){
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

  describe('GET /access/:userid/:granteeid', function(){
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
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, {});

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'groupA', sinon.match.func);
        userExpectations();
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized'});
        return done();
      });
    });

    it('rejects other users in the group without the admin permission', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, null, {view: {}});
      
      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'groupA', sinon.match.func);
        userExpectations();
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized'});
        return done();
      });
    });

    it('allows other users in the group with the admin permission', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.withArgs('user1', 'groupA').callsArgWith(2, null, {admin: {}});
      userInGroupStub.withArgs('user2', 'groupA').callsArgWith(2);

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.equal(null);
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows other users in the group with the custodian permission', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.withArgs('user1', 'groupA').callsArgWith(2, null, {custodian: {}});
      userInGroupStub.withArgs('user2', 'groupA').callsArgWith(2);

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.equal(null);
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows users to check on its own status in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2);

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(result).to.equal(null);
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'groupA', sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('doesn\'t leak information to users checking on their own status in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user2' });
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2);

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

    it('errors on error from userInGroup on permissions check', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1'});
      sinon.stub(dataBroker, 'userInGroup').callsArgWith(2, new Error('whatsamatta'));

      client.userInGroup('user2', 'groupA', function(err, result){
        expect(err).to.deep.equal({ statusCode: 500 });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'groupA', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('errors on error from userInGroup on actual', function(done) {
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

  describe('POST /access/:userid/:granteeid', function(){
    it('rejects people who are not the group, an admin of the group (none), nor a server', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2);

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized' });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('rejects people who are not the group, an admin of the group (view only), nor a server', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2, null, { view: {} });

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized' });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('rejects people who are not the group, an admin of the group (upload only), nor a server', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2, null, { upload: {} });

      client.setPermissions('user1', 'user2', { view: {} }, function(err, result){
        expect(err).to.deep.equal({ statusCode: 401, message: 'Unauthorized' });
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('allows the server', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1', isserver: true });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2, null, { upload: {} });
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3);

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(result).to.deep.equal({ upload: {} });
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user1', 'user2', { upload: {} }, sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows people who are the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2, null, { upload: {} });
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3);

      client.setPermissions('user2', 'user1', { upload: {} }, function(err, result){
        expect(result).to.deep.equal({ upload: {} });
        expect(dataBroker.userInGroup).to.have.been.calledWith('user2', 'user1', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user2', 'user1', { upload: {} }, sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows people who are an admin in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.onFirstCall().callsArgWith(2, null, { admin: {} });
      userInGroupStub.onSecondCall().callsArgWith(2, null, { admin: {}, upload: {} });
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3);

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(result).to.deep.equal({ admin: {}, upload: {} });
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user1', 'user2', { upload: {} }, sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows people who are a custodian in the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.onFirstCall().callsArgWith(2, null, { custodian: {} });
      userInGroupStub.onSecondCall().callsArgWith(2, null, { admin: {}, upload: {} });
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3);

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(result).to.deep.equal({ admin: {}, upload: {} });
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user1', 'user2', { upload: {} }, sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('allows people who are removing themselves from the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.onFirstCall().callsArgWith(2, null, { upload: {}, view: {} });
      userInGroupStub.onSecondCall().callsArgWith(2);
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3);

      client.setPermissions('user1', 'user2', {}, function(err, result){
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user1', 'user2', {}, sinon.match.func);
        userExpectations();
        return done(err);
      });
    });

    it('does not allow people who are modifying the group', function(done) {
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.onFirstCall().callsArgWith(2, null, { view: {} });
      sinon.stub(dataBroker, 'setPermissions');

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({statusCode: 401, message: 'Unauthorized'});
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.not.have.been.called;
        userExpectations();
        return done();
      });
    });

    it('errors on call to userInGroup to check admin state', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2, new Error('MarsAndVenus'));

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({statusCode: 500});
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('errors on setPermissions', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      sinon.stub(dataBroker, 'userInGroup').onFirstCall().callsArgWith(2, null, { admin: {} });
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3, new Error('MarsAndVenus'));

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({statusCode: 500});
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user1', 'user2', { upload: {} }, sinon.match.func);
        userExpectations();
        return done();
      });
    });

    it('errors on call to userInGroup on permissions check', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.onFirstCall().callsArgWith(2, new Error('MarsAndVenus'));
      sinon.stub(dataBroker, 'setPermissions');

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({statusCode: 500});
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.not.have.been.called;
        userExpectations();
        return done();
      });
    });

    it('errors on call to userInGroup to get final permissions', function(done){
      var userExpectations = expectTokenCheck(null, { userid: 'user1' });
      var userInGroupStub = sinon.stub(dataBroker, 'userInGroup');
      userInGroupStub.onFirstCall().callsArgWith(2, null, { admin: {} });
      userInGroupStub.onSecondCall().callsArgWith(2, new Error('MarsAndVenus'));
      sinon.stub(dataBroker, 'setPermissions').onFirstCall().callsArgWith(3);

      client.setPermissions('user1', 'user2', { upload: {} }, function(err, result){
        expect(err).to.deep.equal({statusCode: 500});
        expect(result).to.not.exist;
        expect(dataBroker.userInGroup).to.have.been.calledWith('user1', 'user2', sinon.match.func);
        expect(dataBroker.setPermissions).to.have.been.calledWith('user1', 'user2', { upload: {} }, sinon.match.func);
        userExpectations();
        return done();
      });
    });
  });
});
