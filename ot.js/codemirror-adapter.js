/*global ot */

ot.CodeMirrorAdapter = (function (global) {
  'use strict';

  var Selection = ot.Selection;

  function CodeMirrorAdapter (cm) {
    this.cm = cm;
    this.ignoreNextChange = false;
    this.changeInProgress = false;
    this.selectionChanged = false;
    this.previousText = cm.getValue();

    bind(this, 'onChanges');
    bind(this, 'onChange');
    bind(this, 'onCursorActivity');
    bind(this, 'onFocus');
    bind(this, 'onBlur');

    cm.on('changes', this.onChanges);
    cm.on('change', this.onChange);
    cm.on('cursorActivity', this.onCursorActivity);
    cm.on('focus', this.onFocus);
    cm.on('blur', this.onBlur);
  }

  // Removes all event listeners from the CodeMirror instance.
  CodeMirrorAdapter.prototype.detach = function () {
    this.cm.off('changes', this.onChanges);
    this.cm.off('change', this.onChange);
    this.cm.off('cursorActivity', this.onCursorActivity);
    this.cm.off('focus', this.onFocus);
    this.cm.off('blur', this.onBlur);
  };

  function cmpPos (a, b) {
    if (a.line < b.line) { return -1; }
    if (a.line > b.line) { return 1; }
    if (a.ch < b.ch)     { return -1; }
    if (a.ch > b.ch)     { return 1; }
    return 0;
  }
  function posEq (a, b) { return cmpPos(a, b) === 0; }
  function posLe (a, b) { return cmpPos(a, b) <= 0; }

  function minPos (a, b) { return posLe(a, b) ? a : b; }
  function maxPos (a, b) { return posLe(a, b) ? b : a; }

  function codemirrorDocLength (doc) {
    return doc.indexFromPos({ line: doc.lastLine(), ch: 0 }) +
      doc.getLine(doc.lastLine()).length;
  }

  CodeMirrorAdapter.deltaFromTextContent = function (previousText, currentText) {
    const prevDelta = new Delta().insert(previousText);
    const currentDelta = new Delta().insert(currentText);
    const diffDelta = prevDelta.diff(currentDelta);
    const invertDelta = diffDelta.invert(prevDelta);
    return [diffDelta, invertDelta];
  }

  function deltaToText(delta) {
    return delta.reduce(function (text, op) {
      if (!op.insert) throw new TypeError('only `insert` operations can be transformed!');
      if (typeof op.insert !== 'string') return text + ' ';
      return text + op.insert;
    }, '');
  }

  // Apply an operation to a CodeMirror instance.
  CodeMirrorAdapter.applyOperationToCodeMirror = function (operation, cm) {
    cm.operation(function () {
      var ops = operation.ops;
      var index = 0; // holds the current index into CodeMirror's content
      for (var i = 0, l = ops.length; i < l; i++) {
        var op = ops[i];
        if (op.retain) {
          index += op.retain;
        } else if (op.insert) {
          cm.replaceRange(op.insert, cm.posFromIndex(index));
          index += op.insert.length;
        } else if (op.delete) {
          var from = cm.posFromIndex(index);
          var to   = cm.posFromIndex(index + op.delete);
          cm.replaceRange('', from, to);
        }
      }
    });
  };

  CodeMirrorAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  CodeMirrorAdapter.prototype.onChange = function () {
    // By default, CodeMirror's event order is the following:
    // 1. 'change', 2. 'cursorActivity', 3. 'changes'.
    // We want to fire the 'selectionChange' event after the 'change' event,
    // but need the information from the 'changes' event. Therefore, we detect
    // when a change is in progress by listening to the change event, setting
    // a flag that makes this adapter defer all 'cursorActivity' events.
    this.changeInProgress = true;
  };

  CodeMirrorAdapter.prototype.onChanges = function (_, changes) {
    const currentText = this.cm.getValue();
    if (!this.ignoreNextChange) {
      var pair = CodeMirrorAdapter.deltaFromTextContent(this.previousText, currentText);
      this.trigger('change', pair[0], pair[1]);
    }
    this.previousText = currentText;
    if (this.selectionChanged) { this.trigger('selectionChange'); }
    this.changeInProgress = false;
    this.ignoreNextChange = false;
  };

  CodeMirrorAdapter.prototype.onCursorActivity =
  CodeMirrorAdapter.prototype.onFocus = function () {
    if (this.changeInProgress) {
      this.selectionChanged = true;
    } else {
      this.trigger('selectionChange');
    }
  };

  CodeMirrorAdapter.prototype.onBlur = function () {
    if (!this.cm.somethingSelected()) { this.trigger('blur'); }
  };

  CodeMirrorAdapter.prototype.getValue = function () {
    return this.cm.getValue();
  };

  CodeMirrorAdapter.prototype.getSelection = function () {
    var cm = this.cm;

    var selectionList = cm.listSelections();
    var ranges = [];
    for (var i = 0; i < selectionList.length; i++) {
      ranges[i] = new Selection.Range(
        cm.indexFromPos(selectionList[i].anchor),
        cm.indexFromPos(selectionList[i].head)
      );
    }

    return new Selection(ranges);
  };

  CodeMirrorAdapter.prototype.setSelection = function (selection) {
    var ranges = [];
    for (var i = 0; i < selection.ranges.length; i++) {
      var range = selection.ranges[i];
      ranges[i] = {
        anchor: this.cm.posFromIndex(range.anchor),
        head:   this.cm.posFromIndex(range.head)
      };
    }
    this.cm.setSelections(ranges);
  };

  var addStyleRule = (function () {
    var added = {};
    var styleElement = document.createElement('style');
    document.documentElement.getElementsByTagName('head')[0].appendChild(styleElement);
    var styleSheet = styleElement.sheet;

    return function (css) {
      if (added[css]) { return; }
      added[css] = true;
      styleSheet.insertRule(css, (styleSheet.cssRules || styleSheet.rules).length);
    };
  }());

  CodeMirrorAdapter.prototype.setOtherCursor = function (position, color, clientId) {
    var cursorPos = this.cm.posFromIndex(position);
    var cursorCoords = this.cm.cursorCoords(cursorPos);
    var cursorEl = document.createElement('span');
    cursorEl.className = 'other-client';
    cursorEl.style.display = 'inline-block';
    cursorEl.style.padding = '0';
    cursorEl.style.marginLeft = cursorEl.style.marginRight = '-1px';
    cursorEl.style.borderLeftWidth = '2px';
    cursorEl.style.borderLeftStyle = 'solid';
    cursorEl.style.borderLeftColor = color;
    cursorEl.style.height = (cursorCoords.bottom - cursorCoords.top) * 0.9 + 'px';
    cursorEl.style.zIndex = 0;
    cursorEl.setAttribute('data-clientid', clientId);
    return this.cm.setBookmark(cursorPos, { widget: cursorEl, insertLeft: true });
  };

  CodeMirrorAdapter.prototype.setOtherSelectionRange = function (range, color, clientId) {
    var match = /^#([0-9a-fA-F]{6})$/.exec(color);
    if (!match) { throw new Error("only six-digit hex colors are allowed."); }
    var selectionClassName = 'selection-' + match[1];
    var rule = '.' + selectionClassName + ' { background: ' + color + '; }';
    addStyleRule(rule);

    var anchorPos = this.cm.posFromIndex(range.anchor);
    var headPos   = this.cm.posFromIndex(range.head);

    return this.cm.markText(
      minPos(anchorPos, headPos),
      maxPos(anchorPos, headPos),
      { className: selectionClassName }
    );
  };

  CodeMirrorAdapter.prototype.setOtherSelection = function (selection, color, clientId) {
    var selectionObjects = [];
    for (var i = 0; i < selection.ranges.length; i++) {
      var range = selection.ranges[i];
      if (range.isEmpty()) {
        selectionObjects[i] = this.setOtherCursor(range.head, color, clientId);
      } else {
        selectionObjects[i] = this.setOtherSelectionRange(range, color, clientId);
      }
    }
    return {
      clear: function () {
        for (var i = 0; i < selectionObjects.length; i++) {
          selectionObjects[i].clear();
        }
      }
    };
  };

  CodeMirrorAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  CodeMirrorAdapter.prototype.applyOperation = function (operation) {
    this.ignoreNextChange = true;
    CodeMirrorAdapter.applyOperationToCodeMirror(operation, this.cm);
  };

  CodeMirrorAdapter.prototype.registerUndo = function (undoFn) {
    this.cm.undo = undoFn;
  };

  CodeMirrorAdapter.prototype.registerRedo = function (redoFn) {
    this.cm.redo = redoFn;
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Bind a method to an object, so it doesn't matter whether you call
  // object.method() directly or pass object.method as a reference to another
  // function.
  function bind (obj, method) {
    var fn = obj[method];
    obj[method] = function () {
      fn.apply(obj, arguments);
    };
  }

  return CodeMirrorAdapter;

}(this));
