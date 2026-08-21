// Copyright IBM Corp. 2017,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const DateString = require('../lib/date-string');
const fmt = require('util').format;
const inspect = require('util').inspect;

describe('DateString', function() {
  describe('constructor', function() {
    it('should support a valid date string', function() {
      const theDate = '2015-01-01';
      const date = new DateString(theDate);
      assert.notEqual(date, null);
      assert.equal(date.when, theDate);
      assert.equal(date.toString(), theDate);
    });

    testValidInput('should allow date with time', '2015-01-01 02:00:00');
    testValidInput('should allow full UTC datetime', '2015-06-30T20:00:00.000Z');
    testValidInput('should allow date with UTC offset', '2015-01-01 20:00:00 GMT-5');

    testInvalidInput('should throw on non-date string', 'notadate', 'Invalid date');
    testInvalidInput('should throw on incorrect date-like value',
      '2015-01-01 25:00:00', 'Invalid date');
    testInvalidInput('should throw on non-string input', 20150101,
      'Input must be a string');
    testInvalidInput('should throw on null input', null, 'Input must be a string');

    it('should update internal date on set', function() {
      const date = new DateString('2015-01-01');
      date.when = '2016-01-01';
      assert.equal(date.when, '2016-01-01');
      const d = new Date('2016-01-01');
      // The internal date representation should also be updated!
      assert.equal(date._date.toString(), d.toString());
    });

    it('should accept DateString instance', function() {
      const input = new DateString('2015-01-01');
      const inst = new DateString(input);
      assert.equal(inst.toString(), '2015-01-01');
    });

    it('should return custom inspect output', function() {
      const date = new DateString('2015-01-01');
      const result = inspect(date);
      assert.notEqual(result, null);
      assert.equal(result, fmt('DateString ' + inspect({
        when: date.when,
        _date: date._date,
      })));
    });

    it('should return JSON output', function() {
      const date = new DateString('2015-01-01');
      const result = date.toJSON();
      assert.equal(result, JSON.stringify({when: date.when}));
    });

    function testValidInput(msg, val) {
      it(msg, function() {
        const theDate = new DateString(val);
        assert.equal(theDate.when, val);
        const d = new Date(val);
        assert.equal(theDate._date.toString(), d.toString());
      });
    }

    function testInvalidInput(msg, val, err) {
      it(msg, () => {
        assert.throws(() => {
          new DateString(val);
        }, {message: err});
      });
    }
  });
});
