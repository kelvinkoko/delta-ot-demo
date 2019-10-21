/*global ot */

ot.FirebaseAdapter = (function() {
  'use strict';

  function FirebaseAdapter(docRef) {
    var self = this;
    self.CHECKPOINT_FREQUENCY = 5;
    self.docRef = docRef;
    self.deltasRef = docRef.child('deltas');
    self.checkpointRef = docRef.child('checkpoint');
    this.monitorDeltas(self.deltasRef);

    socket
      .on('client_left', function(clientId) {
        self.trigger('client_left', clientId);
      })
      .on('set_name', function(clientId, name) {
        self.trigger('set_name', clientId, name);
      })
      .on('ack', function() {
        self.trigger('ack');
      })
      .on('operation', function(clientId, operation, selection) {
        self.trigger('operation', operation);
        self.trigger('selection', clientId, selection);
      })
      .on('selection', function(clientId, selection) {
        self.trigger('selection', clientId, selection);
      })
      .on('reconnect', function() {
        self.trigger('reconnect');
      });
  }

  FirebaseAdapter.prototype.monitorDeltas = function(deltasRef) {
    var self = this;
    deltasRef.on('child_added', function(data) {
      const revision = data.key;
      const delta = new Delta(data.val());
      if (self.sent && revision === self.sent.revision.toString() && _.isEqual(delta, self.sent.delta)) {
        self.setCheckpoint(revision, )
        setTimeout(function() {
          self.trigger('ack');
        }, 1)
      } else {
        setTimeout(function() {
          self.trigger('operation', delta);
        }, 1)
      }
    });
  };

  FirebaseAdapter.prototype.setCheckpoint = function(revision, content) {
    this.checkpointRef.set({
      revision,
      content
    });
  };

  FirebaseAdapter.prototype.sendOperation = function(revision, operation, selection) {
    // TODO: update selection
    this.sent = {
      revision: revision,
      delta: operation
    }
    this.deltasRef.child(revision).set(operation);
    // this.socket.emit('operation', revision, operation, selection);
  };

  FirebaseAdapter.prototype.sendSelection = function(selection) {
    // TODO: update selection
    // this.socket.emit('selection', selection);
  };

  FirebaseAdapter.prototype.registerCallbacks = function(cb) {
    this.callbacks = cb;
  };

  FirebaseAdapter.prototype.trigger = function(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) {
      action.apply(this, args);
    }
  };

  return FirebaseAdapter;

}());
