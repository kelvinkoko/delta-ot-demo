/*global ot */

ot.FirebaseAdapter = (function() {
  'use strict';

  function FirebaseAdapter(userId, revision, initContent, docRef) {
    var self = this;
    self.CHECKPOINT_FREQUENCY = 5;
    self.userId = userId;
    self.docRef = docRef;
    self.cursorsRef = docRef.child('cursors');
    self.deltasRef = docRef.child('deltas');
    self.checkpointRef = docRef.child('checkpoint');
    self.revision = revision;
    self.document = new Delta().insert(initContent);

    self.monitorDeltas(self.deltasRef);
    self.monitorCursors(self.cursorsRef);
  }

  function deltaToText(delta) {
    return delta.reduce(function(text, op) {
      if (!op.insert) throw new TypeError('only `insert` operations can be transformed!');
      if (typeof op.insert !== 'string') return text + ' ';
      return text + op.insert;
    }, '');
  }

  FirebaseAdapter.prototype.monitorCursors = function(cursorsRef) {
    var self = this;
    cursorsRef.on('child_changed', function(data) {
      const clientId = data.key;
      const cursor = data.val();
      if (clientId !== self.userId) {
        self.trigger('selection', clientId, cursor);
      }
    });
  }

  FirebaseAdapter.prototype.monitorDeltas = function(deltasRef) {
    var self = this;
    deltasRef.on('child_added', function(data) {
      const receivedRevision = parseInt(data.key);
      const receivedDataPayload = data.val();
      if (receivedRevision <= self.revision) {
        return;
      }
      const delta = new Delta(receivedDataPayload.operation);
      const receivedDeltaUserId = receivedDataPayload.author;
      self.document = self.document.compose(delta)
      if (self.sent && receivedRevision === self.sent.revision) {
        // Received the operation of this client sent
        if (receivedDeltaUserId === self.userId) {
          if (receivedRevision % self.CHECKPOINT_FREQUENCY === 0) {
            self.setCheckpoint(receivedRevision, deltaToText(self.document));
          }
          self.sent = null;
          self.trigger('ack');
        } else {
          // This revision already used by other client, apply the received
          // operation and retry sending pending operation
          self.trigger('operation', delta);
          self.trigger('resend');
        }
      } else {
        self.trigger('operation', delta);
      }
    });
  };

  FirebaseAdapter.prototype.setCheckpoint = function(revision, content) {
    this.checkpointRef.set({
      revision,
      content
    });
  };

  FirebaseAdapter.prototype.sendOperation = function(currentRevision, operation, selection) {
    var self = this;
    // TODO: update selection
    const nextRevision = currentRevision + 1;
    this.sent = {
      revision: nextRevision,
      delta: operation
    }

    function doTransaction(deltasRef, nextRevision, operation) {
      deltasRef.child(nextRevision).transaction(function(current) {
        if (current === null) {
          return {
            operation: operation,
            author: self.userId
          }
        }
      }, function(error, committed, snapshot) {
        if (error) {
          console.log('Error in send operation', error);
        } else if (!committed) {
          console.log('We aborted the transaction (because already exists).');
        }
      }, /*applyLocally=*/ false);
    }

    doTransaction(this.deltasRef, nextRevision, operation);
    // this.socket.emit('operation', revision, operation, selection);
  };

  FirebaseAdapter.prototype.sendSelection = function(selection) {
    this.cursorsRef.child(this.userId).set(selection);
    this.cursorsRef.child(this.userId).onDisconnect().remove();
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
