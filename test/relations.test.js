// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// This test was migrated to node:test and node:assert/strict
'use strict';

const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
} = require('node:test');
const assert = require('node:assert/strict');

/* global getSchema:false, connectorCapabilities:false */
const bdd = require('./helpers/bdd-if');
require('./init.js');
const uid = require('./helpers/uid-generator');
const jdb = require('../');
const DataSource = jdb.DataSource;
const createPromiseCallback = require('../lib/utils.js').createPromiseCallback;

let db, tmp, Book, Chapter, Author, Reader, Article, Employee;
let Category, Job;
let Picture, PictureLink;
let Person, Address;
let Link;

const getTransientDataSource = function(settings) {
  return new DataSource('transient', settings, db.modelBuilder);
};

const getMemoryDataSource = function(settings) {
  return new DataSource('memory', settings, db.modelBuilder);
};

describe('relations', function() {
  before(function() {
    db = getSchema();
  });

  describe('hasMany', function() {
    before(async function() {
      await new Promise((resolve, reject) => {
        Book = db.define('Book', {name: String, type: String});
        Chapter = db.define('Chapter', {name: {type: String, index: true},
          bookType: String});
        Author = db.define('Author', {name: String});
        Reader = db.define('Reader', {name: String});

        db.automigrate(['Book', 'Chapter', 'Author', 'Reader'], err => err ? reject(err) : resolve());
      });
    });

    it('can be declared in different ways', async function() {
      await new Promise((resolve, reject) => {
        Book.hasMany(Chapter);
        Book.hasMany(Reader, {as: 'users'});
        Book.hasMany(Author, {foreignKey: 'projectId'});
        const b = new Book;
        assert.ok(b.chapters instanceof Function);
        assert.ok(b.users instanceof Function);
        assert.ok(b.authors instanceof Function);
        assert.ok(Object.keys((new Chapter).toObject()).includes('bookId'));
        assert.ok(Object.keys((new Author).toObject()).includes('projectId'));

        db.automigrate(['Book', 'Chapter', 'Author', 'Reader'], err => err ? reject(err) : resolve());
      });
    });

    it('can be declared in short form', async function() {
      await new Promise((resolve, reject) => {
        Author = db.define('Author', {name: String});
        Reader = db.define('Reader', {name: String});
        Author.hasMany('readers');
        assert.ok((new Author).readers instanceof Function);
        assert.ok(Object.keys((new Reader).toObject()).includes('authorId'));

        db.autoupdate(['Author', 'Reader'], err => err ? reject(err) : resolve());
      });
    });

    describe('with scope', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          Book.hasMany(Chapter);
          resolve();
        });
      });

      it('should build record on scope', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            const chaps = book.chapters;
            const c = chaps.build();
            assert.deepStrictEqual(c.bookId, book.id);
            c.save(err => err ? reject(err) : resolve());
          });
        });
      });

      it('should create record on scope', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            book.chapters.create(function(err, c) {
              if (err) return reject(err);
              assert.ok(c != null);
              assert.deepStrictEqual(c.bookId, book.id);
              if (err) reject(err); else resolve();
            });
          });
        });
      });

      it('should not update FK', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            book.chapters.create({name: 'chapter 1'}, function(err, c) {
              if (err) return reject(err);
              assert.ok(c != null);
              assert.deepStrictEqual(c.bookId, book.id);
              assert.deepStrictEqual(c.name, 'chapter 1');
              book.chapters.updateById(c.id, {name: 'chapter 0', bookId: 10}, function(err, cc) {
                assert.ok(err != null);
                assert.ok(err.message.startsWith('Cannot override foreign key'));
                resolve();
              });
            });
          });
        });
      });

      it('should create record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Book.create()
            .then(function(book) {
              return book.chapters.create()
                .then(function(c) {
                  assert.ok(c != null);
                  assert.deepStrictEqual(c.bookId, book.id);
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should create a batch of records on scope', async function() {
        await new Promise((resolve, reject) => {
          const chapters = [
            {name: 'a'},
            {name: 'z'},
            {name: 'c'},
          ];
          Book.create(function(err, book) {
            book.chapters.create(chapters, function(err, chs) {
              if (err) return reject(err);
              assert.ok(chs != null);
              assert.strictEqual(chs.length, chapters.length);
              chs.forEach(function(c) {
                assert.deepStrictEqual(c.bookId, book.id);
              });
              resolve();
            });
          });
        });
      });

      it('should create a batch of records on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          const chapters = [
            {name: 'a'},
            {name: 'z'},
            {name: 'c'},
          ];
          Book.create(function(err, book) {
            book.chapters.create(chapters)
              .then(function(chs) {
                assert.ok(chs != null);
                assert.strictEqual(chs.length, chapters.length);
                chs.forEach(function(c) {
                  assert.deepStrictEqual(c.bookId, book.id);
                });
                resolve();
              }).catch(reject);
          });
        });
      });

      it('should fetch all scoped instances', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function() {
              book.chapters.create({name: 'z'}, function() {
                book.chapters.create({name: 'c'}, function() {
                  verify(book);
                });
              });
            });
          });
          function verify(book) {
            book.chapters(function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 3);

              const chapters = book.chapters();
              assert.deepStrictEqual(chapters, ch);

              book.chapters(function(e, c) {
                assert.ok(e == null);
                assert.ok(c != null);
                assert.strictEqual(ch.length, 3);
                const acz = ['a', 'c', 'z'];
                assert.ok(acz.includes(c[0].name));
                assert.ok(acz.includes(c[1].name));
                assert.ok(acz.includes(c[2].name));
                resolve();
              });
            });
          }
        });
      });

      it('should fetch all scoped instances with promises', async function() {
        await new Promise((resolve, reject) => {
          Book.create()
            .then(function(book) {
              return book.chapters.create({name: 'a'})
                .then(function() {
                  return book.chapters.create({name: 'z'});
                })
                .then(function() {
                  return book.chapters.create({name: 'c'});
                })
                .then(function() {
                  return verify(book);
                });
            }).catch(reject);

          function verify(book) {
            return book.chapters.find()
              .then(function(ch) {
                assert.ok(ch != null);
                assert.strictEqual(ch.length, 3);
                const chapters = book.chapters();
                assert.deepStrictEqual(chapters, ch);
                return book.chapters.find()
                  .then(function(c) {
                    assert.ok(c != null);
                    assert.strictEqual(ch.length, 3);
                    const acz = ['a', 'c', 'z'];
                    assert.ok(acz.includes(c[0].name));
                    assert.ok(acz.includes(c[1].name));
                    assert.ok(acz.includes(c[2].name));
                    resolve();
                  });
              });
          }
        });
      });

      it('should fetch all scoped instances with find() with callback and condition', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function() {
              book.chapters.create({name: 'z'}, function() {
                book.chapters.create({name: 'c'}, function() {
                  verify(book);
                });
              });
            });
          });
          function verify(book) {
            book.chapters(function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 3);

              const chapters = book.chapters();
              assert.deepStrictEqual(chapters, ch);
              book.chapters.find(function(e, c) {
                assert.ok(e == null);
                assert.ok(c != null);
                assert.strictEqual(ch.length, 3);
                const acz = ['a', 'c', 'z'];
                assert.ok(acz.includes(c[0].name));
                assert.ok(acz.includes(c[1].name));
                assert.ok(acz.includes(c[2].name));
                resolve();
              });
            });
          }
        });
      });

      it('should fetch all scoped instances with find() with callback and no condition', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function() {
              book.chapters.create({name: 'z'}, function() {
                book.chapters.create({name: 'c'}, function() {
                  verify(book);
                });
              });
            });
          });
          function verify(book) {
            book.chapters(function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 3);

              const chapters = book.chapters();
              assert.deepStrictEqual(chapters, ch);

              book.chapters.find(function(e, c) {
                assert.ok(e == null);
                assert.ok(c != null);
                assert.ok(c.length != null);
                assert.strictEqual(c.length, 3);
                const acz = ['a', 'c', 'z'];
                assert.ok(acz.includes(c[0].name));
                assert.ok(acz.includes(c[1].name));
                assert.ok(acz.includes(c[2].name));
                resolve();
              });
            });
          }
        });
      });

      it('should find scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function(err, ch) {
              id = ch.id;
              book.chapters.create({name: 'z'}, function() {
                book.chapters.create({name: 'c'}, function() {
                  verify(book);
                });
              });
            });
          });

          function verify(book) {
            book.chapters.findById(id, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.deepStrictEqual(ch.id, id);
              resolve();
            });
          }
        });
      });

      it('should find scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create()
            .then(function(book) {
              return book.chapters.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return book.chapters.create({name: 'z'});
                })
                .then(function() {
                  return book.chapters.create({name: 'c'});
                })
                .then(function() {
                  return verify(book);
                });
            }).catch(reject);

          function verify(book) {
            return book.chapters.findById(id)
              .then(function(ch) {
                assert.ok(ch != null);
                assert.deepStrictEqual(ch.id, id);
                resolve();
              });
          }
        });
      });

      it('should count scoped records - all and filtered', async function() {
        await new Promise((resolve, reject) => {
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function(err, ch) {
              book.chapters.create({name: 'b'}, function() {
                book.chapters.create({name: 'c'}, function() {
                  verify(book);
                });
              });
            });
          });

          function verify(book) {
            book.chapters.count(function(err, count) {
              if (err) return reject(err);
              assert.strictEqual(count, 3);
              book.chapters.count({name: 'b'}, function(err, count) {
                if (err) return reject(err);
                assert.strictEqual(count, 1);
                resolve();
              });
            });
          }
        });
      });

      it('should count scoped records - all and filtered with promises', async function() {
        await new Promise((resolve, reject) => {
          Book.create()
            .then(function(book) {
              book.chapters.create({name: 'a'})
                .then(function() {
                  return book.chapters.create({name: 'b'});
                })
                .then(function() {
                  return book.chapters.create({name: 'c'});
                })
                .then(function() {
                  return verify(book);
                });
            }).catch(reject);

          function verify(book) {
            return book.chapters.count()
              .then(function(count) {
                assert.strictEqual(count, 3);
                return book.chapters.count({name: 'b'});
              })
              .then(function(count) {
                assert.strictEqual(count, 1);
                resolve();
              });
          }
        });
      });

      it('should set targetClass on scope property', function() {
        assert.strictEqual(Book.prototype.chapters._targetClass, 'Chapter');
      });

      it('should update scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function(err, ch) {
              id = ch.id;
              book.chapters.updateById(id, {name: 'aa'}, function(err, ch) {
                verify(book);
              });
            });
          });

          function verify(book) {
            book.chapters.findById(id, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.deepStrictEqual(ch.id, id);
              assert.strictEqual(ch.name, 'aa');
              resolve();
            });
          }
        });
      });

      it('should update scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create()
            .then(function(book) {
              return book.chapters.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return book.chapters.updateById(id, {name: 'aa'});
                })
                .then(function(ch) {
                  return verify(book);
                });
            })
            .catch(reject);

          function verify(book) {
            return book.chapters.findById(id)
              .then(function(ch) {
                assert.ok(ch != null);
                assert.deepStrictEqual(ch.id, id);
                assert.strictEqual(ch.name, 'aa');
                resolve();
              });
          }
        });
      });

      it('should destroy scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function(err, ch) {
              id = ch.id;
              book.chapters.destroy(id, function(err, ch) {
                verify(book);
              });
            });
          });

          function verify(book) {
            book.chapters.findById(id, function(err, ch) {
              assert.ok(err != null);
              resolve();
            });
          }
        });
      });

      it('should destroy scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create()
            .then(function(book) {
              return book.chapters.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return book.chapters.destroy(id);
                })
                .then(function(ch) {
                  return verify(book);
                });
            })
            .catch(reject);

          function verify(book) {
            return book.chapters.findById(id)
              .catch(function(err) {
                assert.ok(err != null);
                resolve();
              });
          }
        });
      });

      it('should check existence of a scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create(function(err, book) {
            book.chapters.create({name: 'a'}, function(err, ch) {
              id = ch.id;
              book.chapters.create({name: 'z'}, function() {
                book.chapters.create({name: 'c'}, function() {
                  verify(book);
                });
              });
            });
          });

          function verify(book) {
            book.chapters.exists(id, function(err, flag) {
              if (err) return reject(err);
              assert.deepStrictEqual(flag, true);
              resolve();
            });
          }
        });
      });

      it('should check existence of a scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Book.create()
            .then(function(book) {
              return book.chapters.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return book.chapters.create({name: 'z'});
                })
                .then(function() {
                  return book.chapters.create({name: 'c'});
                })
                .then(function() {
                  return verify(book);
                });
            }).catch(reject);

          function verify(book) {
            return book.chapters.exists(id)
              .then(function(flag) {
                assert.deepStrictEqual(flag, true);
                resolve();
              });
          }
        });
      });

      it('should check ignore related data on creation - array', async function() {
        await new Promise((resolve, reject) => {
          Book.create({chapters: []}, function(err, book) {
            if (err) return reject(err);
            assert.strictEqual(typeof book.chapters, 'function');
            const obj = book.toObject();
            assert.ok(obj.chapters == null);
            resolve();
          });
        });
      });

      it('should check ignore related data on creation with promises - array', async function() {
        await new Promise((resolve, reject) => {
          Book.create({chapters: []})
            .then(function(book) {
              assert.strictEqual(typeof book.chapters, 'function');
              const obj = book.toObject();
              assert.ok(obj.chapters == null);
              resolve();
            }).catch(reject);
        });
      });

      it('should check ignore related data on creation - object', async function() {
        await new Promise((resolve, reject) => {
          Book.create({chapters: {}}, function(err, book) {
            if (err) return reject(err);
            assert.strictEqual(typeof book.chapters, 'function');
            const obj = book.toObject();
            assert.ok(obj.chapters == null);
            resolve();
          });
        });
      });

      it('should check ignore related data on creation with promises - object', async function() {
        await new Promise((resolve, reject) => {
          Book.create({chapters: {}})
            .then(function(book) {
              assert.strictEqual(typeof book.chapters, 'function');
              const obj = book.toObject();
              assert.ok(obj.chapters == null);
              resolve();
            }).catch(reject);
        });
      });
    });
  });
  describe('hasMany through', function() {
    let Physician, Patient, Appointment, Address;

    before(async function() {
      await new Promise((resolve, reject) => {
        Physician = db.define('Physician', {name: String});
        Patient = db.define('Patient', {name: String, age: Number, realm: String,
          sequence: {type: Number, index: true}});
        Appointment = db.define('Appointment', {date: {type: Date,
          default: function() {
            return new Date();
          }}});
        Address = db.define('Address', {name: String});

        Physician.hasMany(Patient, {through: Appointment});
        Patient.hasMany(Physician, {through: Appointment});
        Patient.belongsTo(Address);
        Appointment.belongsTo(Patient);
        Appointment.belongsTo(Physician);

        db.automigrate(['Physician', 'Patient', 'Appointment', 'Address'], err => err ? reject(err) : resolve());
      });
    });

    it('should build record on scope', async function() {
      await new Promise((resolve, reject) => {
        Physician.create(function(err, physician) {
          const patient = physician.patients.build();
          assert.deepStrictEqual(patient.physicianId, physician.id);
          patient.save(err => err ? reject(err) : resolve());
        });
      });
    });

    it('should create record on scope', async function() {
      await new Promise((resolve, reject) => {
        Physician.create(function(err, physician) {
          physician.patients.create(function(err, patient) {
            if (err) return reject(err);
            assert.ok(patient != null);
            Appointment.find({where: {physicianId: physician.id, patientId: patient.id}},
              function(err, apps) {
                if (err) return reject(err);
                assert.strictEqual(apps.length, 1);
                resolve();
              });
          });
        });
      });
    });

    it('should create record on scope with promises', async function() {
      await new Promise((resolve, reject) => {
        Physician.create()
          .then(function(physician) {
            return physician.patients.create()
              .then(function(patient) {
                assert.ok(patient != null);
                return Appointment.find({where: {physicianId: physician.id, patientId: patient.id}})
                  .then(function(apps) {
                    assert.strictEqual(apps.length, 1);
                    resolve();
                  });
              });
          }).catch(reject);
      });
    });

    it('should create multiple records on scope', async function() {
      await new Promise((resolve, reject) => {
        Physician.create(function(err, physician) {
          physician.patients.create([{}, {}], function(err, patients) {
            if (err) return reject(err);
            assert.ok(patients != null);
            assert.strictEqual(patients.length, 2);
            function verifyPatient(patient, next) {
              Appointment.find({where: {
                physicianId: physician.id,
                patientId: patient.id,
              }},
              function(err, apps) {
                if (err) return reject(err);
                assert.strictEqual(apps.length, 1);
                next();
              });
            }
            Promise.all(patients.map(patient => new Promise((resolve, reject) => {
              verifyPatient(patient, err => {
                if (err) return reject(err);
                resolve();
              });
            }))).then(() => resolve(), reject);
          });
        });
      });
    });

    it('should create multiple records on scope with promises', async function() {
      await new Promise((resolve, reject) => {
        Physician.create()
          .then(function(physician) {
            return physician.patients.create([{}, {}])
              .then(function(patients) {
                assert.ok(patients != null);
                assert.strictEqual(patients.length, 2);
                function verifyPatient(patient, next) {
                  Appointment.find({where: {
                    physicianId: physician.id,
                    patientId: patient.id,
                  }})
                    .then(function(apps) {
                      assert.strictEqual(apps.length, 1);
                      next();
                    });
                }
                Promise.all(patients.map(patient => new Promise((resolve, reject) => {
                  verifyPatient(patient, err => {
                    if (err) return reject(err);
                    resolve();
                  });
                }))).then(() => resolve(), reject);
              });
          }).catch(reject);
      });
    });

    it('should fetch all scoped instances', async function() {
      await new Promise((resolve, reject) => {
        Physician.create(function(err, physician) {
          physician.patients.create({name: 'a'}, function() {
            physician.patients.create({name: 'z'}, function() {
              physician.patients.create({name: 'c'}, function() {
                verify(physician);
              });
            });
          });
        });
        function verify(physician) {
          physician.patients(function(err, ch) {
            const patients = physician.patients();
            assert.deepStrictEqual(patients, ch);

            if (err) return reject(err);
            assert.ok(ch != null);
            assert.strictEqual(ch.length, 3);
            resolve();
          });
        }
      });
    });

    it('should fetch all scoped instances with promises', async function() {
      await new Promise((resolve, reject) => {
        Physician.create()
          .then(function(physician) {
            return physician.patients.create({name: 'a'})
              .then(function() {
                return physician.patients.create({name: 'z'});
              })
              .then(function() {
                return physician.patients.create({name: 'c'});
              })
              .then(function() {
                return verify(physician);
              });
          }).catch(reject);
        function verify(physician) {
          return physician.patients.find()
            .then(function(ch) {
              const patients = physician.patients();
              assert.strictEqual(patients, ch);

              assert.ok(ch != null);
              assert.strictEqual(ch.length, 3);
              resolve();
            });
        }
      });
    });

    describe('fetch scoped instances with paging filters', function() {
      let samplePatientId;
      let physician;

      async function createSampleData() {
        await new Promise((resolve, reject) => {
          Physician.create(function(err, result) {
            result.patients.create({name: 'a', age: '10', sequence: 1},
              function(err, p) {
                samplePatientId = p.id;
                result.patients.create({name: 'z', age: '20', sequence: 2},
                  function() {
                    result.patients.create({name: 'c', sequence: 3}, function() {
                      physician = result;
                      resolve();
                    });
                  });
              });
          });
        });
      }

      beforeEach(createSampleData);

      describe('with filter skip', function() {
        bdd.itIf(connectorCapabilities.supportPagination !== false,
          'skips the first patient', async function() {
            await new Promise((resolve, reject) => {
              physician.patients({skip: 1, order: 'sequence'}, function(err, ch) {
                if (err) return reject(err);
                assert.ok(ch != null);
                assert.strictEqual(ch.length, 2);
                assert.deepStrictEqual(ch[0].name, 'z');
                assert.deepStrictEqual(ch[1].name, 'c');
                resolve();
              });
            });
          });
      });
      describe('with filter order', function() {
        it('orders the result by patient name', async function() {
          await new Promise((resolve, reject) => {
            const filter = connectorCapabilities.adhocSort !== false ? {order: 'name DESC'} : {};
            physician.patients(filter, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 3);
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(ch[0].name, 'z');
                assert.deepStrictEqual(ch[1].name, 'c');
                assert.deepStrictEqual(ch[2].name, 'a');
              } else {
                const acz = ['a', 'c', 'z'];
                assert.ok((acz).includes(ch[0].name));
                assert.ok((acz).includes(ch[1].name));
                assert.ok((acz).includes(ch[2].name));
              }
              resolve();
            });
          });
        });
      });
      describe('with filter limit', function() {
        it('limits to 1 result', async function() {
          await new Promise((resolve, reject) => {
            physician.patients({limit: 1, order: 'sequence'}, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 1);
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(ch[0].name, 'a');
              } else {
                assert.ok((['a', 'c', 'z']).includes(ch[0].name));
              }
              resolve();
            });
          });
        });
      });
      describe('with filter fields', function() {
        it('includes field \'name\' but not \'age\'', async function() {
          await new Promise((resolve, reject) => {
            const fieldsFilter = {
              fields: {name: true, age: false},
              order: 'sequence',
            };
            physician.patients(fieldsFilter, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.ok(ch[0].name != null);
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(ch[0].name, 'a');
              } else {
                assert.ok((['a', 'c', 'z']).includes(ch[0].name));
              }
              assert.ok(ch[0].age == null);
              resolve();
            });
          });
        });
      });
      describe('with filter include', function() {
        it('returns physicians included in patient', async function() {
          await new Promise((resolve, reject) => {
            const includeFilter = {include: 'physicians'};
            physician.patients(includeFilter, function(err, ch) {
              if (err) return reject(err);
              assert.strictEqual(ch.length, 3);
              assert.ok(ch[0].physicians != null);
              resolve();
            });
          });
        });
      });
      describe('with filter where', function() {
        it('returns patient where id equal to samplePatientId', async function() {
          await new Promise((resolve, reject) => {
            const whereFilter = {where: {id: samplePatientId}};
            physician.patients(whereFilter, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 1);
              assert.deepStrictEqual(ch[0].id, samplePatientId);
              resolve();
            });
          });
        });
        it('returns patient where name equal to samplePatient name', async function() {
          await new Promise((resolve, reject) => {
            const whereFilter = {where: {name: 'a'}};
            physician.patients(whereFilter, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 1);
              assert.deepStrictEqual(ch[0].name, 'a');
              resolve();
            });
          });
        });
        it('returns patients where id in an array', async function() {
          await new Promise((resolve, reject) => {
            const idArr = [];
            let whereFilter;
            physician.patients.create({name: 'b'}, function(err, p) {
              idArr.push(samplePatientId, p.id);
              whereFilter = {where: {id: {inq: idArr}}};
              physician.patients(whereFilter, function(err, ch) {
                if (err) return reject(err);
                assert.ok(ch != null);
                assert.strictEqual(ch.length, 2);
                if (typeof idArr[0] === 'object') {
                // mongodb returns `id` as an object
                  idArr[0] = idArr[0].toString();
                  idArr[1] = idArr[1].toString();
                  assert.notStrictEqual(idArr.indexOf(ch[0].id.toString()), -1);
                  assert.notStrictEqual(idArr.indexOf(ch[1].id.toString()), -1);
                } else {
                  assert.notStrictEqual(idArr.indexOf(ch[0].id), -1);
                  assert.notStrictEqual(idArr.indexOf(ch[1].id), -1);
                }
                resolve();
              });
            });
          });
        });
        it('returns empty result when patientId does not belongs to physician', async function() {
          await new Promise((resolve, reject) => {
            Patient.create({name: 'x'}, function(err, p) {
              if (err) return reject(err);
              assert.ok(p != null);

              const wrongWhereFilter = {where: {id: p.id}};
              physician.patients(wrongWhereFilter, function(err, ch) {
                if (err) return reject(err);
                assert.ok(ch != null);
                assert.strictEqual(ch.length, 0);
                resolve();
              });
            });
          });
        });
        describe('findById with filter include', function() {
          it('returns patient where id equal to \'samplePatientId\'' +
          'with included physicians', async function() {
            await new Promise((resolve, reject) => {
              const includeFilter = {include: 'physicians'};
              physician.patients.findById(samplePatientId,
                includeFilter, function(err, ch) {
                  if (err) return reject(err);
                  assert.ok(ch != null);
                  assert.deepStrictEqual(ch.id, samplePatientId);
                  assert.ok(ch.physicians != null);
                  resolve();
                });
            });
          });
        });
        describe('findById with filter fields', function() {
          it('returns patient where id equal to \'samplePatientId\'' +
          'with field \'name\' but not \'age\'', async function() {
            await new Promise((resolve, reject) => {
              const fieldsFilter = {fields: {name: true, age: false}};
              physician.patients.findById(samplePatientId,
                fieldsFilter, function(err, ch) {
                  if (err) return reject(err);
                  assert.ok(ch != null);
                  assert.ok(ch.name != null);
                  assert.deepStrictEqual(ch.name, 'a');
                  assert.ok(ch.age == null);
                  resolve();
                });
            });
          });
        });
        describe('findById with include filter that contains string fields', function() {
          it('should accept string and convert it to array', async function() {
            await new Promise((resolve, reject) => {
              const includeFilter = {include: {relation: 'patients', scope: {fields: 'name'}}};
              const physicianId = physician.id;
              Physician.findById(physicianId, includeFilter, function(err, result) {
                if (err) return reject(err);
                assert.ok(result != null);
                assert.deepStrictEqual(result.id, physicianId);
                assert.ok(result.patients != null);
                assert.ok(result.patients() instanceof Array);
                assert.ok(result.patients()[0] != null);
                assert.ok(result.patients()[0].name != null);
                assert.ok(result.patients()[0].age == null);
                resolve();
              });
            });
          });
        });
      });
    });
    describe('find over related model with options', function() {
      after(function() {
        Physician.clearObservers('access');
        Patient.clearObservers('access');
      });
      before(function() {
        Physician.observe('access', beforeAccessFn);
        Patient.observe('access', beforeAccessFn);

        function beforeAccessFn(ctx, next) {
          ctx.query.where.realm = ctx.options.realm;
          next();
        }
      });
      it('should find be filtered from option', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create(function(err, physician) {
            if (err) return reject(err);
            physician.patients.create({name: 'a', realm: 'test'}, function(err, ch) {
              if (err) return reject(err);
              id = ch.id;
              physician.patients.create({name: 'z', realm: 'test'}, function(err) {
                if (err) return reject(err);
                physician.patients.create({name: 'c', realm: 'anotherRealm'}, function(err) {
                  if (err) return reject(err);
                  verify(physician);
                });
              });
            });
          });

          function verify(physician) {
            physician.patients({order: 'name ASC'}, {realm: 'test'}, function(err, records) {
              if (err) return reject(err);
              assert.ok(records != null);
              assert.deepStrictEqual(records.length, 2);
              const expected = ['a:test', 'z:test'];
              const actual = records.map(function(r) { return r.name + ':' + r.realm; });
              assert.deepStrictEqual(actual.sort(), expected.sort());
              resolve();
            });
          }
        });
      });

      it('should find scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create(function(err, physician) {
            physician.patients.create({name: 'a'}, function(err, ch) {
              id = ch.id;
              physician.patients.create({name: 'z'}, function() {
                physician.patients.create({name: 'c'}, function() {
                  verify(physician);
                });
              });
            });
          });

          function verify(physician) {
            physician.patients.findById(id, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.deepStrictEqual(ch.id, id);
              resolve();
            });
          }
        });
      });

      it('should find scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create()
            .then(function(physician) {
              return physician.patients.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return physician.patients.create({name: 'z'});
                })
                .then(function() {
                  return physician.patients.create({name: 'c'});
                })
                .then(function() {
                  return verify(physician);
                });
            }).catch(reject);

          function verify(physician) {
            return physician.patients.findById(id, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.deepStrictEqual(ch.id, id);
              resolve();
            });
          }
        });
      });

      it('should allow to use include syntax on related data', async function() {
        await new Promise((resolve, reject) => {
          Physician.create(function(err, physician) {
            physician.patients.create({name: 'a'}, function(err, patient) {
              Address.create({name: 'z'}, function(err, address) {
                if (err) return reject(err);
                patient.address(address);
                patient.save(function() {
                  verify(physician, address.id);
                });
              });
            });
          });
          function verify(physician, addressId) {
            physician.patients({include: 'address'}, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.strictEqual(ch.length, 1);
              assert.deepStrictEqual(ch[0].addressId, addressId);
              const address = ch[0].address();
              assert.ok(address != null);
              assert.ok(address instanceof Address);
              assert.strictEqual(address.name, 'z');
              resolve();
            });
          }
        });
      });

      it('should allow to use include syntax on related data with promises', async function() {
        await new Promise((resolve, reject) => {
          Physician.create()
            .then(function(physician) {
              return physician.patients.create({name: 'a'})
                .then(function(patient) {
                  return Address.create({name: 'z'})
                    .then(function(address) {
                      patient.address(address);
                      return patient.save()
                        .then(function() {
                          return verify(physician, address.id);
                        });
                    });
                });
            }).catch(reject);

          function verify(physician, addressId) {
            return physician.patients.find({include: 'address'})
              .then(function(ch) {
                assert.ok(ch != null);
                assert.strictEqual(ch.length, 1);
                assert.deepStrictEqual(ch[0].addressId.toString(), addressId.toString());
                const address = ch[0].address();
                assert.ok(address != null);
                assert.ok(address instanceof Address);
                assert.strictEqual(address.name, 'z');
                resolve();
              });
          }
        });
      });

      it('should set targetClass on scope property', function() {
        assert.strictEqual(Physician.prototype.patients._targetClass, 'Patient');
      });

      it('should update scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create(function(err, physician) {
            physician.patients.create({name: 'a'}, function(err, ch) {
              id = ch.id;
              physician.patients.updateById(id, {name: 'aa'}, function(err, ch) {
                verify(physician);
              });
            });
          });

          function verify(physician) {
            physician.patients.findById(id, function(err, ch) {
              if (err) return reject(err);
              assert.ok(ch != null);
              assert.deepStrictEqual(ch.id, id);
              assert.strictEqual(ch.name, 'aa');
              resolve();
            });
          }
        });
      });

      it('should update scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create()
            .then(function(physician) {
              return physician.patients.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return physician.patients.updateById(id, {name: 'aa'})
                    .then(function(ch) {
                      return verify(physician);
                    });
                });
            }).catch(reject);

          function verify(physician) {
            return physician.patients.findById(id)
              .then(function(ch) {
                assert.ok(ch != null);
                assert.deepStrictEqual(ch.id, id);
                assert.strictEqual(ch.name, 'aa');
                resolve();
              });
          }
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should destroy scoped record', async function() {
          await new Promise((resolve, reject) => {
            let id;
            Physician.create(function(err, physician) {
              physician.patients.create({name: 'a'}, function(err, ch) {
                id = ch.id;
                physician.patients.destroy(id, function(err, ch) {
                  verify(physician);
                });
              });
            });

            function verify(physician) {
              physician.patients.findById(id, function(err, ch) {
                assert.ok(err != null);
                resolve();
              });
            }
          });
        });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should destroy scoped record with promises', async function() {
          await new Promise((resolve, reject) => {
            let id;
            Physician.create()
              .then(function(physician) {
                return physician.patients.create({name: 'a'})
                  .then(function(ch) {
                    id = ch.id;
                    return physician.patients.destroy(id)
                      .then(function(ch) {
                        return verify(physician);
                      });
                  });
              }).catch(reject);

            function verify(physician) {
              return physician.patients.findById(id)
                .then(function(ch) {
                  assert.ok(ch == null);
                  resolve();
                })
                .catch(function(err) {
                  assert.ok(err != null);
                  resolve();
                });
            }
          });
        });

      it('should check existence of a scoped record', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create(function(err, physician) {
            physician.patients.create({name: 'a'}, function(err, ch) {
              if (err) return reject(err);
              id = ch.id;
              physician.patients.create({name: 'z'}, function() {
                physician.patients.create({name: 'c'}, function() {
                  verify(physician);
                });
              });
            });
          });

          function verify(physician) {
            physician.patients.exists(id, function(err, flag) {
              if (err) return reject(err);
              assert.deepStrictEqual(flag, true);
              resolve();
            });
          }
        });
      });

      it('should check existence of a scoped record with promises', async function() {
        await new Promise((resolve, reject) => {
          let id;
          Physician.create()
            .then(function(physician) {
              return physician.patients.create({name: 'a'})
                .then(function(ch) {
                  id = ch.id;
                  return physician.patients.create({name: 'z'});
                })
                .then(function() {
                  return physician.patients.create({name: 'c'});
                })
                .then(function() {
                  return verify(physician);
                });
            }).catch(reject);

          function verify(physician) {
            return physician.patients.exists(id)
              .then(function(flag) {
                assert.deepStrictEqual(flag, true);
                resolve();
              });
          }
        });
      });

      it('should allow to add connection with instance', async function() {
        await new Promise((resolve, reject) => {
          Physician.create({name: 'ph1'}, function(e, physician) {
            Patient.create({name: 'pa1'}, function(e, patient) {
              physician.patients.add(patient, function(e, app) {
                assert.ok(e == null);
                assert.ok(app != null);
                assert.ok(app instanceof Appointment);
                assert.deepStrictEqual(app.physicianId, physician.id);
                assert.deepStrictEqual(app.patientId, patient.id);
                resolve();
              });
            });
          });
        });
      });

      it('should allow to add connection with instance with promises', async function() {
        await new Promise((resolve, reject) => {
          Physician.create({name: 'ph1'})
            .then(function(physician) {
              return Patient.create({name: 'pa1'})
                .then(function(patient) {
                  return physician.patients.add(patient)
                    .then(function(app) {
                      assert.ok(app != null);
                      assert.ok(app instanceof Appointment);
                      assert.deepStrictEqual(app.physicianId, physician.id);
                      assert.deepStrictEqual(app.patientId, patient.id);
                      resolve();
                    });
                });
            }).catch(reject);
        });
      });

      it('should allow to add connection with through data', async function() {
        await new Promise((resolve, reject) => {
          Physician.create({name: 'ph1'}, function(e, physician) {
            Patient.create({name: 'pa1'}, function(e, patient) {
              const now = Date.now();
              physician.patients.add(patient, {date: new Date(now)}, function(e, app) {
                assert.ok(e == null);
                assert.ok(app != null);
                assert.ok(app instanceof Appointment);
                assert.deepStrictEqual(app.physicianId, physician.id);
                assert.deepStrictEqual(app.patientId, patient.id);
                assert.deepStrictEqual(app.patientId, patient.id);
                assert.strictEqual(app.date.getTime(), now);
                resolve();
              });
            });
          });
        });
      });

      it('should allow to add connection with through data with promises', async function() {
        await new Promise((resolve, reject) => {
          Physician.create({name: 'ph1'})
            .then(function(physician) {
              return Patient.create({name: 'pa1'})
                .then(function(patient) {
                  const now = Date.now();
                  return physician.patients.add(patient, {date: new Date(now)})
                    .then(function(app) {
                      assert.ok(app != null);
                      assert.ok(app instanceof Appointment);
                      assert.deepStrictEqual(app.physicianId, physician.id);
                      assert.deepStrictEqual(app.patientId, patient.id);
                      assert.deepStrictEqual(app.patientId, patient.id);
                      assert.strictEqual(app.date.getTime(), now);
                      resolve();
                    });
                });
            }).catch(reject);
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should allow to remove connection with instance', async function() {
          await new Promise((resolve, reject) => {
            let id;
            Physician.create(function(err, physician) {
              physician.patients.create({name: 'a'}, function(err, patient) {
                id = patient.id;
                physician.patients.remove(id, function(err, ch) {
                  verify(physician);
                });
              });
            });

            function verify(physician) {
              physician.patients.exists(id, function(err, flag) {
                if (err) return reject(err);
                assert.deepStrictEqual(flag, false);
                resolve();
              });
            }
          });
        });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should allow to remove connection with instance with promises', async function() {
          await new Promise((resolve, reject) => {
            let id;
            Physician.create()
              .then(function(physician) {
                return physician.patients.create({name: 'a'})
                  .then(function(patient) {
                    id = patient.id;
                    return physician.patients.remove(id)
                      .then(function(ch) {
                        return verify(physician);
                      });
                  });
              }).catch(reject);

            function verify(physician) {
              return physician.patients.exists(id)
                .then(function(flag) {
                  assert.deepStrictEqual(flag, false);
                  resolve();
                });
            }
          });
        });

      beforeEach(async function() {
        await new Promise((resolve, reject) => {
          Appointment.destroyAll(function(err) {
            Physician.destroyAll(function(err) {
              Patient.destroyAll(err => err ? reject(err) : resolve());
            });
          });
        });
      });

      describe('hasMany through - collect', function() {
        let Physician, Patient, Appointment, Address;
        let idPatient, idPhysician;

        beforeEach(async function() {
          await new Promise((resolve, reject) => {
            idPatient = uid.fromConnector(db) || 1234;
            idPhysician = uid.fromConnector(db) || 2345;
            Physician = db.define('Physician', {name: String});
            Patient = db.define('Patient', {name: String});
            Appointment = db.define('Appointment', {date: {type: Date,
              default: function() {
                return new Date();
              }}});
            Address = db.define('Address', {name: String});

            db.automigrate(['Physician', 'Patient', 'Appointment', 'Address'], err => err ? reject(err) : resolve());
          });
        });

        describe('with default options', function() {
          it('can determine the collect by modelTo\'s name as default', function() {
            Physician.hasMany(Patient, {through: Appointment});
            Patient.hasMany(Physician, {through: Appointment, as: 'yyy'});
            Patient.belongsTo(Address);
            Appointment.belongsTo(Physician);
            Appointment.belongsTo(Patient);
            const physician = new Physician({id: idPhysician});
            const scope1 = physician.patients._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'patient');
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'patient');
            const patient = new Patient({id: idPatient});
            const scope2 = patient.yyy._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'physician');
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'physician');
          });
        });

        describe('when custom reverse belongsTo names for both sides', function() {
          it('can determine the collect via keyThrough', function() {
            Physician.hasMany(Patient, {
              through: Appointment, foreignKey: 'fooId', keyThrough: 'barId',
            });
            Patient.hasMany(Physician, {
              through: Appointment, foreignKey: 'barId', keyThrough: 'fooId', as: 'yyy',
            });
            Appointment.belongsTo(Physician, {as: 'foo'});
            Appointment.belongsTo(Patient, {as: 'bar'});
            Patient.belongsTo(Address); // jam.
            Appointment.belongsTo(Patient, {as: 'car'}); // jam. Should we complain in this case???

            const physician = new Physician({id: idPhysician});
            const scope1 = physician.patients._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'bar');
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'bar');
            const patient = new Patient({id: idPatient});
            const scope2 = patient.yyy._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'foo');
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'foo');
          });

          it('can determine the collect via modelTo name', function() {
            Physician.hasMany(Patient, {through: Appointment});
            Patient.hasMany(Physician, {through: Appointment, as: 'yyy'});
            Appointment.belongsTo(Physician, {as: 'foo', foreignKey: 'physicianId'});
            Appointment.belongsTo(Patient, {as: 'bar', foreignKey: 'patientId'});
            Patient.belongsTo(Address); // jam.

            const physician = new Physician({id: idPhysician});
            const scope1 = physician.patients._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'bar');
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'bar');
            const patient = new Patient({id: idPatient});
            const scope2 = patient.yyy._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'foo');
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'foo');
          });

          it('can determine the collect via modelTo name (with jams)', function() {
            Physician.hasMany(Patient, {through: Appointment});
            Patient.hasMany(Physician, {through: Appointment, as: 'yyy'});
            Appointment.belongsTo(Physician, {as: 'foo', foreignKey: 'physicianId'});
            Appointment.belongsTo(Patient, {as: 'bar', foreignKey: 'patientId'});
            Patient.belongsTo(Address); // jam.
            Appointment.belongsTo(Physician, {as: 'goo', foreignKey: 'physicianId'}); // jam. Should we complain in this case???
            Appointment.belongsTo(Patient, {as: 'car', foreignKey: 'patientId'}); // jam. Should we complain in this case???

            const physician = new Physician({id: idPhysician});
            const scope1 = physician.patients._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'bar');
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'bar');
            const patient = new Patient({id: idPatient});
            const scope2 = patient.yyy._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'foo'); // first matched relation
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'foo'); // first matched relation
          });
        });

        describe('when custom reverse belongsTo name for one side only', function() {
          beforeEach(function() {
            Physician.hasMany(Patient, {as: 'xxx', through: Appointment, foreignKey: 'fooId'});
            Patient.hasMany(Physician, {as: 'yyy', through: Appointment, keyThrough: 'fooId'});
            Appointment.belongsTo(Physician, {as: 'foo'});
            Appointment.belongsTo(Patient);
            Patient.belongsTo(Address); // jam.
            Appointment.belongsTo(Physician, {as: 'bar'}); // jam. Should we complain in this case???
          });

          it('can determine the collect via model name', function() {
            const physician = new Physician({id: idPhysician});
            const scope1 = physician.xxx._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'patient');
            assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'patient');
          });

          it('can determine the collect via keyThrough', function() {
            const patient = new Patient({id: idPatient});
            const scope2 = patient.yyy._scope;
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'foo');
            assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'foo');
          });
        });
      });

      describe('hasMany through - customized relation name and foreign key', function() {
        let Physician, Patient, Appointment;

        beforeEach(async function() {
          await new Promise((resolve, reject) => {
            Physician = db.define('Physician', {name: String});
            Patient = db.define('Patient', {name: String});
            Appointment = db.define('Appointment', {date: {type: Date, defaultFn: 'now'}});

            db.automigrate(['Physician', 'Patient', 'Appointment'], err => err ? reject(err) : resolve());
          });
        });

        it('should use real target class', function() {
          Physician.hasMany(Patient, {through: Appointment, as: 'xxx', foreignKey: 'aaaId', keyThrough: 'bbbId'});
          Patient.hasMany(Physician, {through: Appointment, as: 'yyy', foreignKey: 'bbbId', keyThrough: 'aaaId'});
          Appointment.belongsTo(Physician, {as: 'aaa', foreignKey: 'aaaId'});
          Appointment.belongsTo(Patient, {as: 'bbb', foreignKey: 'bbbId'});
          const physician = new Physician({id: 1});
          assert.ok(Object.prototype.hasOwnProperty.call(physician.xxx, '_targetClass')); assert.strictEqual(physician.xxx._targetClass, 'Patient');
          const patient = new Patient({id: 1});
          assert.ok(Object.prototype.hasOwnProperty.call(patient.yyy, '_targetClass')); assert.strictEqual(patient.yyy._targetClass, 'Physician');
        });
      });
    });
    describe('hasMany through bi-directional relations on the same model', function() {
      let User, Follow, Address;
      let idFollower, idFollowee;

      before(async function() {
        await new Promise((resolve, reject) => {
          idFollower = uid.fromConnector(db) || 3456;
          idFollowee = uid.fromConnector(db) || 4567;
          User = db.define('User', {name: String});
          Follow = db.define('Follow', {date: {type: Date,
            default: function() {
              return new Date();
            }}});
          Address = db.define('Address', {name: String});

          User.hasMany(User, {
            as: 'followers', foreignKey: 'followeeId', keyThrough: 'followerId', through: Follow,
          });
          User.hasMany(User, {
            as: 'following', foreignKey: 'followerId', keyThrough: 'followeeId', through: Follow,
          });
          User.belongsTo(Address);
          Follow.belongsTo(User, {as: 'follower'});
          Follow.belongsTo(User, {as: 'followee'});
          db.automigrate(['User', 'Follow'], err => err ? reject(err) : resolve());
        });
      });

      it('should set foreignKeys of through model correctly in first relation',
        async function() {
          await new Promise((resolve, reject) => {
            const follower = new User({id: idFollower});
            const followee = new User({id: idFollowee});
            followee.followers.add(follower, function(err, throughInst) {
              if (err) return reject(err);
              assert.ok(throughInst != null);
              assert.deepStrictEqual(throughInst.followerId, follower.id);
              assert.deepStrictEqual(throughInst.followeeId, followee.id);
              resolve();
            });
          });
        });

      it('should set foreignKeys of through model correctly in second relation',
        async function() {
          await new Promise((resolve, reject) => {
            const follower = new User({id: idFollower});
            const followee = new User({id: idFollowee});
            follower.following.add(followee, function(err, throughInst) {
              if (err) return reject(err);
              assert.ok(throughInst != null);
              assert.deepStrictEqual(throughInst.followeeId.toString(), followee.id.toString());
              assert.deepStrictEqual(throughInst.followerId.toString(), follower.id.toString());
              resolve();
            });
          });
        });

      describe('hasMany through - between same models', function() {
        let User, Follow, Address;
        let idFollower, idFollowee;

        before(async function() {
          await new Promise((resolve, reject) => {
            idFollower = uid.fromConnector(db) || 3456;
            idFollowee = uid.fromConnector(db) || 4567;
            User = db.define('User', {name: String});
            Follow = db.define('Follow', {date: {type: Date,
              default: function() {
                return new Date();
              }}});
            Address = db.define('Address', {name: String});

            User.hasMany(User, {
              as: 'followers', foreignKey: 'followeeId', keyThrough: 'followerId', through: Follow,
            });
            User.hasMany(User, {
              as: 'following', foreignKey: 'followerId', keyThrough: 'followeeId', through: Follow,
            });
            User.belongsTo(Address);
            Follow.belongsTo(User, {as: 'follower'});
            Follow.belongsTo(User, {as: 'followee'});
            db.automigrate(['User', 'Follow', 'Address'], err => err ? reject(err) : resolve());
          });
        });

        it('should set the keyThrough and the foreignKey', async function() {
          await new Promise((resolve, reject) => {
            const user = new User({id: idFollower});
            const user2 = new User({id: idFollowee});
            user.following.add(user2, function(err, f) {
              if (err) return reject(err);
              assert.ok(f != null);
              assert.deepStrictEqual(f.followeeId, user2.id);
              assert.deepStrictEqual(f.followerId, user.id);
              resolve();
            });
          });
        });

        it('can determine the collect via keyThrough for each side', function() {
          const user = new User({id: idFollower});
          const scope1 = user.followers._scope;
          assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'follower');
          assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'follower');
          const scope2 = user.following._scope;
          assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'followee');
          assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'followee');
        });
      });
    });
    describe('hasMany with properties', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          Book = db.define('Book', {name: String, type: String});
          Chapter = db.define('Chapter', {name: {type: String, index: true},
            bookType: String});
          Book.hasMany(Chapter, {properties: {type: 'bookType'}});
          db.automigrate(['Book', 'Chapter'], err => err ? reject(err) : resolve());
        });
      });

      it('should create record on scope', async function() {
        await new Promise((resolve, reject) => {
          Book.create({type: 'fiction'}, function(err, book) {
            book.chapters.create(function(err, c) {
              if (err) return reject(err);
              assert.ok(c != null);
              assert.deepStrictEqual(c.bookId, book.id);
              assert.strictEqual(c.bookType, 'fiction');
              resolve();
            });
          });
        });
      });

      it('should create record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Book.create({type: 'fiction'})
            .then(function(book) {
              return book.chapters.create()
                .then(function(c) {
                  assert.ok(c != null);
                  assert.deepStrictEqual(c.bookId, book.id);
                  assert.strictEqual(c.bookType, 'fiction');
                  resolve();
                });
            }).catch(reject);
        });
      });
    });
    describe('hasMany with scope and properties', function() {
      it('can be declared with properties', async function() {
        await new Promise((resolve, reject) => {
          Category = db.define('Category', {name: String, jobType: String});
          Job = db.define('Job', {name: String, type: String});

          Category.hasMany(Job, {
            properties: function(inst, target) {
              if (!inst.jobType) return; // skip
              return {type: inst.jobType};
            },
            scope: function(inst, filter) {
              const m = this.properties(inst); // re-use properties
              if (m) return {where: m};
            },
          });
          db.automigrate(['Category', 'Job'], err => err ? reject(err) : resolve());
        });
      });

      it('should create record on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.create(function(err, c) {
            assert.ok(err == null);
            c.jobs.create({type: 'book'}, function(err, p) {
              assert.ok(err == null);
              assert.deepStrictEqual(p.categoryId, c.id);
              assert.strictEqual(p.type, 'book');
              c.jobs.create({type: 'widget'}, function(err, p) {
                assert.ok(err == null);
                assert.deepStrictEqual(p.categoryId, c.id);
                assert.strictEqual(p.type, 'widget');
                resolve();
              });
            });
          });
        });
      });

      it('should create record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.create()
            .then(function(c) {
              return c.jobs.create({type: 'book'})
                .then(function(p) {
                  assert.deepStrictEqual(p.categoryId, c.id);
                  assert.strictEqual(p.type, 'book');
                  return c.jobs.create({type: 'widget'})
                    .then(function(p) {
                      assert.deepStrictEqual(p.categoryId, c.id);
                      assert.strictEqual(p.type, 'widget');
                      resolve();
                    });
                });
            }).catch(reject);
        });
      });

      it('should find records on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobs(function(err, jobs) {
              assert.ok(err == null);
              assert.strictEqual(jobs.length, 2);
              resolve();
            });
          });
        });
      });

      it('should find records on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(c) {
              return c.jobs.find();
            })
            .then(function(jobs) {
              assert.strictEqual(jobs.length, 2);
              resolve();
            })
            .catch(reject);
        });
      });

      it('should find record on scope - filtered', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobs({where: {type: 'book'}}, function(err, jobs) {
              assert.ok(err == null);
              assert.strictEqual(jobs.length, 1);
              assert.strictEqual(jobs[0].type, 'book');
              resolve();
            });
          });
        });
      });

      it('should find record on scope with promises - filtered', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(c) {
              return c.jobs.find({where: {type: 'book'}});
            })
            .then(function(jobs) {
              assert.strictEqual(jobs.length, 1);
              assert.strictEqual(jobs[0].type, 'book');
              resolve();
            })
            .catch(reject);
        });
      });

      // So why not just do the above? In LoopBack, the context
      // that gets passed into a beforeRemote handler contains
      // a reference to the parent scope/instance: ctx.instance
      // in order to enforce a (dynamic scope) at runtime
      // a temporary property can be set in the beforeRemoting
      // handler. Optionally,properties dynamic properties can be declared.
      //
      // The code below simulates this.

      it('should create record on scope - properties', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobType = 'tool'; // temporary
            c.jobs.create(function(err, p) {
              assert.deepStrictEqual(p.categoryId, c.id);
              assert.strictEqual(p.type, 'tool');
              resolve();
            });
          });
        });
      });

      it('should find records on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobs(function(err, jobs) {
              assert.ok(err == null);
              assert.strictEqual(jobs.length, 3);
              resolve();
            });
          });
        });
      });

      it('should find record on scope - scoped', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobType = 'book'; // temporary, for scoping
            c.jobs(function(err, jobs) {
              assert.ok(err == null);
              assert.strictEqual(jobs.length, 1);
              assert.strictEqual(jobs[0].type, 'book');
              resolve();
            });
          });
        });
      });

      it('should find record on scope - scoped', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobType = 'tool'; // temporary, for scoping
            c.jobs(function(err, jobs) {
              assert.ok(err == null);
              assert.strictEqual(jobs.length, 1);
              assert.strictEqual(jobs[0].type, 'tool');
              resolve();
            });
          });
        });
      });

      it('should find count of records on scope - scoped', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, c) {
            assert.ok(err == null);
            c.jobType = 'tool'; // temporary, for scoping
            c.jobs.count(function(err, count) {
              assert.ok(err == null);
              assert.strictEqual(count, 1);
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should delete records on scope - scoped', async function() {
          await new Promise((resolve, reject) => {
            Category.findOne(function(err, c) {
              assert.ok(err == null);
              c.jobType = 'tool'; // temporary, for scoping
              c.jobs.destroyAll(function(err, result) {
                if (err) reject(err); else resolve();
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should find record on scope - verify', async function() {
          await new Promise((resolve, reject) => {
            Category.findOne(function(err, c) {
              assert.ok(err == null);
              c.jobs(function(err, jobs) {
                assert.ok(err == null);
                assert.strictEqual(jobs.length, 2);
                if (err) reject(err); else resolve();
              });
            });
          });
        });

      describe('relations validation', function() {
        let validationError;
        // define a mockup getRelationValidationMsg() method to log the validation error
        const logRelationValidationError = function(code, rType, rName) {
          validationError = {code, rType, rName};
        };

        it('rejects belongsTo relation if `model` is not provided', function() {
          try {
            const Picture = db.define('Picture', {name: String}, {relations: {
              author: {
                type: 'belongsTo',
                foreignKey: 'authorId'},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'BELONGS_TO_MISSING_MODEL',
              rType: 'belongsTo',
              rName: 'author'});
          }
        });

        it('rejects polymorphic belongsTo relation if `model` is provided', function() {
          try {
            const Picture = db.define('Picture', {name: String}, {relations: {
              imageable: {
                type: 'belongsTo',
                model: 'Picture',
                polymorphic: true},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'POLYMORPHIC_BELONGS_TO_MODEL',
              rType: 'belongsTo',
              rName: 'imageable'});
          }
        });

        it('rejects polymorphic non belongsTo relation if `model` is not provided', function() {
          try {
            const Article = db.define('Picture', {name: String}, {relations: {
              pictures: {
                type: 'hasMany',
                polymorphic: 'imageable'},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'POLYMORPHIC_NOT_BELONGS_TO_MISSING_MODEL',
              rType: 'hasMany',
              rName: 'pictures'});
          }
        });

        it('rejects polymorphic relation if `foreignKey` is provided but discriminator ' +
    'is missing', function() {
          try {
            const Article = db.define('Picture', {name: String}, {relations: {
              pictures: {
                type: 'hasMany',
                model: 'Picture',
                polymorphic: {foreignKey: 'imageableId'}},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'POLYMORPHIC_MISSING_DISCRIMINATOR',
              rType: 'hasMany',
              rName: 'pictures'});
          }
        });

        it('rejects polymorphic relation if `discriminator` is provided but foreignKey ' +
    'is missing', function() {
          try {
            const Article = db.define('Picture', {name: String}, {relations: {
              pictures: {
                type: 'hasMany',
                model: 'Picture',
                polymorphic: {discriminator: 'imageableType'}},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'POLYMORPHIC_MISSING_FOREIGN_KEY',
              rType: 'hasMany',
              rName: 'pictures'});
          }
        });

        it('rejects polymorphic relation if `polymorphic.as` is provided along ' +
    'with custom foreignKey/discriminator', function() {
          try {
            const Article = db.define('Picture', {name: String}, {relations: {
              pictures: {
                type: 'hasMany',
                model: 'Picture',
                polymorphic: {
                  as: 'image',
                  foreignKey: 'imageableId',
                  discriminator: 'imageableType',
                }},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'POLYMORPHIC_EXTRANEOUS_AS',
              rType: 'hasMany',
              rName: 'pictures'});
          }
        });

        it('rejects polymorphic relation if `polymorphic.selector` is provided along ' +
    'with custom foreignKey/discriminator', function() {
          try {
            const Article = db.define('Picture', {name: String}, {relations: {
              pictures: {
                type: 'hasMany',
                model: 'Picture',
                polymorphic: {
                  selector: 'image',
                  foreignKey: 'imageableId',
                  discriminator: 'imageableType',
                }},
            }});
            assert.ok(Picture, 'relation validation should have thrown' == null);
          } catch (err) {
            assert.deepStrictEqual(err.details, {
              code: 'POLYMORPHIC_EXTRANEOUS_SELECTOR',
              rType: 'hasMany',
              rName: 'pictures'});
          }
        });

        it('warns on use of deprecated `polymorphic.as` keyword in polymorphic relation', function() {
          let message = 'deprecation not reported';
          process.once('deprecation', function(err) { message = err.message; });

          const Article = db.define('Picture', {name: String}, {relations: {
            pictures: {type: 'hasMany', model: 'Picture', polymorphic: {as: 'imageable'}},
          }});

          assert.match(message, /keyword `polymorphic.as` which will be DEPRECATED in LoopBack.next/);
        });
      });
    });
    describe('polymorphic hasOne', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          Picture = db.define('Picture', {name: String});
          Article = db.define('Article', {name: String});
          Employee = db.define('Employee', {name: String});

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared using default polymorphic selector', async function() {
        await new Promise((resolve, reject) => {
          Article.hasOne(Picture, {as: 'packshot', polymorphic: 'imageable'});
          Employee.hasOne(Picture, {as: 'mugshot', polymorphic: 'imageable'});
          Picture.belongsTo('imageable', {polymorphic: true});

          assert.deepStrictEqual(Article.relations['packshot'].toJSON(), {
            name: 'packshot',
            type: 'hasOne',
            modelFrom: 'Article',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'imageableId',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });

          assert.deepStrictEqual(Picture.relations['imageable'].toJSON(), {
            name: 'imageable',
            type: 'belongsTo',
            modelFrom: 'Picture',
            keyFrom: 'imageableId',
            modelTo: '<polymorphic>',
            keyTo: 'id',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });

      it('should create polymorphic relation - Article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 1'}, function(err, article) {
            assert.ok(err == null);
            article.packshot.create({name: 'Packshot'}, function(err, pic) {
              if (err) return reject(err);
              assert.ok(pic != null);
              assert.deepStrictEqual(pic.imageableId, article.id);
              assert.strictEqual(pic.imageableType, 'Article');
              resolve();
            });
          });
        });
      });

      it('should create polymorphic relation with promises - article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 1'})
            .then(function(article) {
              return article.packshot.create({name: 'Packshot'})
                .then(function(pic) {
                  assert.ok(pic != null);
                  assert.deepStrictEqual(pic.imageableId, article.id);
                  assert.strictEqual(pic.imageableType, 'Article');
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should create polymorphic relation - reader', async function() {
        await new Promise((resolve, reject) => {
          Employee.create({name: 'Employee 1'}, function(err, employee) {
            assert.ok(err == null);
            employee.mugshot.create({name: 'Mugshot'}, function(err, pic) {
              if (err) return reject(err);
              assert.ok(pic != null);
              assert.deepStrictEqual(pic.imageableId, employee.id);
              assert.strictEqual(pic.imageableType, 'Employee');
              resolve();
            });
          });
        });
      });

      it('should find polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne(function(err, article) {
            assert.ok(err == null);
            article.packshot(function(err, pic) {
              if (err) return reject(err);

              const packshot = article.packshot();
              assert.strictEqual(packshot, pic);

              assert.strictEqual(pic.name, 'Packshot');
              assert.deepStrictEqual(pic.imageableId.toString(), article.id.toString());
              assert.strictEqual(pic.imageableType, 'Article');
              resolve();
            });
          });
        });
      });

      it('should find polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.findOne(function(err, employee) {
            assert.ok(err == null);
            employee.mugshot(function(err, mugshot) {
              if (err) return reject(err);
              assert.strictEqual(mugshot.name, 'Mugshot');
              assert.deepStrictEqual(mugshot.imageableId.toString(), employee.id.toString());
              assert.strictEqual(mugshot.imageableType, 'Employee');
              resolve();
            });
          });
        });
      });

      it('should include polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne({include: 'packshot'}, function(err, article) {
            assert.ok(err == null);
            const packshot = article.packshot();
            assert.ok(packshot != null);
            assert.strictEqual(packshot.name, 'Packshot');
            resolve();
          });
        });
      });

      it('should find polymorphic relation with promises - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.findOne()
            .then(function(employee) {
              return employee.mugshot.get()
                .then(function(pic) {
                  assert.strictEqual(pic.name, 'Mugshot');
                  assert.deepStrictEqual(pic.imageableId.toString(), employee.id.toString());
                  assert.strictEqual(pic.imageableType, 'Employee');
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should find inverse polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Packshot'}}, function(err, pic) {
            assert.ok(err == null);
            pic.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Article);
              assert.strictEqual(imageable.name, 'Article 1');
              resolve();
            });
          });
        });
      });

      it('should include inverse polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Packshot'}, include: 'imageable'},
            function(err, pic) {
              assert.ok(err == null);
              const imageable = pic.imageable();
              assert.ok(imageable != null);
              assert.ok(imageable instanceof Article);
              assert.strictEqual(imageable.name, 'Article 1');
              resolve();
            });
        });
      });

      it('should find inverse polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Mugshot'}}, function(err, pic) {
            assert.ok(err == null);
            pic.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Employee);
              assert.strictEqual(imageable.name, 'Employee 1');
              resolve();
            });
          });
        });
      });
    });
    describe('polymorphic hasOne with non standard ids', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          Picture = db.define('Picture', {name: String});
          Article = db.define('Article', {
            username: {type: String, id: true, generated: true},
            name: String,
          });
          Employee = db.define('Employee', {
            username: {type: String, id: true, generated: true},
            name: String,
          });

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared using custom foreignKey/discriminator', async function() {
        await new Promise((resolve, reject) => {
          Article.hasOne(Picture, {
            as: 'packshot',
            polymorphic: {
              foreignKey: 'oid',
              discriminator: 'type',
            },
          });
          Employee.hasOne(Picture, {
            as: 'mugshot',
            polymorphic: {
              foreignKey: 'oid',
              discriminator: 'type',
            },
          });
          Picture.belongsTo('imageable', {
            idName: 'username',
            polymorphic: {
              idType: Article.definition.properties.username.type,
              foreignKey: 'oid',
              discriminator: 'type',
            },
          });

          assert.deepStrictEqual(Article.relations['packshot'].toJSON(), {
            name: 'packshot',
            type: 'hasOne',
            modelFrom: 'Article',
            keyFrom: 'username',
            modelTo: 'Picture',
            keyTo: 'oid',
            multiple: false,
            polymorphic: {
              selector: 'packshot',
              foreignKey: 'oid',
              discriminator: 'type',
            },
          });

          const imageableRel = Picture.relations['imageable'].toJSON();

          // assert idType independantly
          assert(typeof imageableRel.polymorphic.idType == 'function');

          // backup idType and remove it temporarily from the relation
          // object to ease the test
          const idType = imageableRel.polymorphic.idType;
          delete imageableRel.polymorphic.idType;

          assert.deepStrictEqual(imageableRel, {
            name: 'imageable',
            type: 'belongsTo',
            modelFrom: 'Picture',
            keyFrom: 'oid',
            modelTo: '<polymorphic>',
            keyTo: 'username',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'oid',
              discriminator: 'type',
            },
          });

          // restore idType for next tests
          imageableRel.polymorphic.idType = idType;

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });

      it('should create polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 1'}, function(err, article) {
            assert.ok(err == null);
            article.packshot.create({name: 'Packshot'}, function(err, pic) {
              if (err) return reject(err);
              assert.ok(pic != null);
              assert.strictEqual(pic.oid.toString(), article.username.toString());
              assert.strictEqual(pic.type, 'Article');
              resolve();
            });
          });
        });
      });

      it('should create polymorphic relation with promises - article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 1'})
            .then(function(article) {
              return article.packshot.create({name: 'Packshot'})
                .then(function(pic) {
                  assert.ok(pic != null);
                  assert.strictEqual(pic.oid.toString(), article.username.toString());
                  assert.strictEqual(pic.type, 'Article');
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should create polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.create({name: 'Employee 1'}, function(err, employee) {
            assert.ok(err == null);
            employee.mugshot.create({name: 'Mugshot'}, function(err, pic) {
              if (err) return reject(err);
              assert.ok(pic != null);
              assert.strictEqual(pic.oid.toString(), employee.username.toString());
              assert.strictEqual(pic.type, 'Employee');
              resolve();
            });
          });
        });
      });

      it('should find polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne(function(err, article) {
            assert.ok(err == null);
            article.packshot(function(err, pic) {
              if (err) return reject(err);

              const packshot = article.packshot();
              assert.strictEqual(packshot, pic);

              assert.strictEqual(pic.name, 'Packshot');
              assert.strictEqual(pic.oid.toString(), article.username.toString());
              assert.strictEqual(pic.type, 'Article');
              resolve();
            });
          });
        });
      });

      it('should find polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.findOne(function(err, employee) {
            assert.ok(err == null);
            employee.mugshot(function(err, pic) {
              if (err) return reject(err);
              assert.strictEqual(pic.name, 'Mugshot');
              assert.strictEqual(pic.oid.toString(), employee.username.toString());
              assert.strictEqual(pic.type, 'Employee');
              resolve();
            });
          });
        });
      });

      it('should find inverse polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Packshot'}}, function(err, pic) {
            assert.ok(err == null);
            pic.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Article);
              assert.strictEqual(imageable.name, 'Article 1');
              resolve();
            });
          });
        });
      });

      it('should find inverse polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Mugshot'}}, function(err, p) {
            assert.ok(err == null);
            p.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Employee);
              assert.strictEqual(imageable.name, 'Employee 1');
              resolve();
            });
          });
        });
      });

      it('should include polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.findOne({include: 'mugshot'},
            function(err, employee) {
              assert.ok(err == null);
              const mugshot = employee.mugshot();
              assert.ok(mugshot != null);
              assert.strictEqual(mugshot.name, 'Mugshot');
              resolve();
            });
        });
      });

      it('should include inverse polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Mugshot'}, include: 'imageable'},
            function(err, pic) {
              assert.ok(err == null);
              const imageable = pic.imageable();
              assert.ok(imageable != null);
              assert.ok(imageable instanceof Employee);
              assert.strictEqual(imageable.name, 'Employee 1');
              resolve();
            });
        });
      });
    });
    describe('polymorphic hasMany', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          Picture = db.define('Picture', {name: String});
          Article = db.define('Article', {name: String});
          Employee = db.define('Employee', {name: String});

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared with model JSON definition when related model is already attached', async function() {
        await new Promise((resolve, reject) => {
          const ds = new DataSource('memory');

          // by defining Picture model before Article model we make sure Picture IS
          // already attached when defining Article. This way, datasource.defineRelations
          // WILL NOT use the async listener to call hasMany relation method
          const Picture = ds.define('Picture', {name: String}, {relations: {
            imageable: {type: 'belongsTo', polymorphic: true},
          }});
          const Article = ds.define('Article', {name: String}, {relations: {
            pictures: {type: 'hasMany', model: 'Picture', polymorphic: 'imageable'},
          }});

          assert(Article.relations['pictures']);
          assert.deepEqual(Article.relations['pictures'].toJSON(), {
            name: 'pictures',
            type: 'hasMany',
            modelFrom: 'Article',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'imageableId',
            multiple: true,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });

          assert(Picture.relations['imageable']);
          assert.deepEqual(Picture.relations['imageable'].toJSON(), {
            name: 'imageable',
            type: 'belongsTo',
            modelFrom: 'Picture',
            keyFrom: 'imageableId',
            modelTo: '<polymorphic>',
            keyTo: 'id',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });
          resolve();
        });
      });

      it('can be declared with model JSON definition when related model is not yet attached', async function() {
        await new Promise((resolve, reject) => {
          const ds = new DataSource('memory');

          // by defining Author model before Picture model we make sure Picture IS NOT
          // already attached when defining Author. This way, datasource.defineRelations
          // WILL use the async listener to call hasMany relation method
          const Author = ds.define('Author', {name: String}, {relations: {
            pictures: {type: 'hasMany', model: 'Picture', polymorphic: 'imageable'},
          }});
          const Picture = ds.define('Picture', {name: String}, {relations: {
            imageable: {type: 'belongsTo', polymorphic: true},
          }});

          assert(Author.relations['pictures']);
          assert.deepEqual(Author.relations['pictures'].toJSON(), {
            name: 'pictures',
            type: 'hasMany',
            modelFrom: 'Author',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'imageableId',
            multiple: true,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });

          assert(Picture.relations['imageable']);
          assert.deepEqual(Picture.relations['imageable'].toJSON(), {
            name: 'imageable',
            type: 'belongsTo',
            modelFrom: 'Picture',
            keyFrom: 'imageableId',
            modelTo: '<polymorphic>',
            keyTo: 'id',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });
          resolve();
        });
      });

      it('can be declared using default polymorphic selector', async function() {
        await new Promise((resolve, reject) => {
          Article.hasMany(Picture, {polymorphic: 'imageable'});
          Employee.hasMany(Picture, {polymorphic: { // alt syntax
            foreignKey: 'imageableId',
            discriminator: 'imageableType',
          }});
          Picture.belongsTo('imageable', {polymorphic: true});

          assert.deepStrictEqual(Article.relations['pictures'].toJSON(), {
            name: 'pictures',
            type: 'hasMany',
            modelFrom: 'Article',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'imageableId',
            multiple: true,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });

          assert.deepStrictEqual(Picture.relations['imageable'].toJSON(), {
            name: 'imageable',
            type: 'belongsTo',
            modelFrom: 'Picture',
            keyFrom: 'imageableId',
            modelTo: '<polymorphic>',
            keyTo: 'id',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageableId',
              discriminator: 'imageableType',
            },
          });

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });

      it('should create polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 1'}, function(err, article) {
            assert.ok(err == null);
            article.pictures.create({name: 'Article Pic'}, function(err, pics) {
              if (err) return reject(err);
              assert.ok(pics != null);
              assert.deepStrictEqual(pics.imageableId, article.id);
              assert.strictEqual(pics.imageableType, 'Article');
              resolve();
            });
          });
        });
      });

      it('should create polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.create({name: 'Employee 1'}, function(err, employee) {
            assert.ok(err == null);
            employee.pictures.create({name: 'Employee Pic'}, function(err, pics) {
              if (err) return reject(err);
              assert.ok(pics != null);
              assert.deepStrictEqual(pics.imageableId, employee.id);
              assert.strictEqual(pics.imageableType, 'Employee');
              resolve();
            });
          });
        });
      });

      it('should find polymorphic items - article', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne(function(err, article) {
            assert.ok(err == null);
            if (!article) return resolve();
            article.pictures(function(err, pics) {
              if (err) return reject(err);

              const pictures = article.pictures();
              assert.deepStrictEqual(pictures, pics);

              assert.strictEqual(pics.length, 1);
              assert.strictEqual(pics[0].name, 'Article Pic');
              resolve();
            });
          });
        });
      });

      it('should find polymorphic items - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.findOne(function(err, employee) {
            assert.ok(err == null);
            employee.pictures(function(err, pics) {
              if (err) return reject(err);
              assert.strictEqual(pics.length, 1);
              assert.strictEqual(pics[0].name, 'Employee Pic');
              resolve();
            });
          });
        });
      });

      it('should find the inverse of polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Article Pic'}}, function(err, pics) {
            if (err) return reject(err);
            assert.strictEqual(pics.imageableType, 'Article');
            pics.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Article);
              assert.strictEqual(imageable.name, 'Article 1');
              resolve();
            });
          });
        });
      });

      it('should find the inverse of polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Employee Pic'}}, function(err, pics) {
            if (err) return reject(err);
            assert.strictEqual(pics.imageableType, 'Employee');
            pics.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Employee);
              assert.strictEqual(imageable.name, 'Employee 1');
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should include the inverse of polymorphic relation', async function() {
          await new Promise((resolve, reject) => {
            Picture.find({include: 'imageable'}, function(err, pics) {
              if (err) return reject(err);
              assert.strictEqual(pics.length, 2);

              const actual = pics.map(
                function(pic) {
                  return {imageName: pic.name, name: pic.imageable().name};
                },
              );

              assert.ok(actual.some(item => item.name === 'Article 1' && item.imageName === 'Article Pic'));
              assert.ok(actual.some(item => item.name === 'Employee 1' && item.imageName === 'Employee Pic'));

              resolve();
            });
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort === false,
        'should include the inverse of polymorphic relation w/o adhocSort', async function() {
          await new Promise((resolve, reject) => {
            Picture.find({include: 'imageable'}, function(err, pics) {
              if (err) return reject(err);
              assert.strictEqual(pics.length, 2);
              const names = ['Article Pic', 'Employee Pic'];
              const imageables = ['Article 1', 'Employee 1'];
              assert.ok(names.includes(pics[0].name));
              assert.ok(names.includes(pics[1].name));
              assert.ok(imageables.includes(pics[0].imageable().name));
              assert.ok(imageables.includes(pics[1].imageable().name));
              resolve();
            });
          });
        });

      it('should assign a polymorphic relation', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 2'}, function(err, article) {
            assert.ok(err == null);
            const p = new Picture({name: 'Sample'});
            p.imageable(article); // assign
            assert.deepStrictEqual(p.imageableId, article.id);
            assert.strictEqual(p.imageableType, 'Article');
            p.save(err => err ? reject(err) : resolve());
          });
        });
      });

      it('should find polymorphic items - article', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne({where: {name: 'Article 2'}}, function(err, article) {
            assert.ok(err == null);
            article.pictures(function(err, pics) {
              if (err) return reject(err);
              assert.strictEqual(pics.length, 1);
              assert.strictEqual(pics[0].name, 'Sample');
              resolve();
            });
          });
        });
      });

      it('should find the inverse of polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Picture.findOne({where: {name: 'Sample'}}, function(err, p) {
            if (err) return reject(err);
            assert.strictEqual(p.imageableType, 'Article');
            p.imageable(function(err, imageable) {
              if (err) return reject(err);
              assert.ok(imageable instanceof Article);
              assert.strictEqual(imageable.name, 'Article 2');
              resolve();
            });
          });
        });
      });

      it('should include the inverse of polymorphic relation - article',
        async function() {
          await new Promise((resolve, reject) => {
            Picture.findOne({where: {name: 'Sample'}, include: 'imageable'},
              function(err, p) {
                if (err) return reject(err);
                const imageable = p.imageable();
                assert.ok(imageable != null);
                assert.ok(imageable instanceof Article);
                assert.strictEqual(imageable.name, 'Article 2');
                resolve();
              });
          });
        });

      it('can be declared using custom foreignKey/discriminator', async function() {
        await new Promise((resolve, reject) => {
          Article.hasMany(Picture, {polymorphic: {
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }});
          Employee.hasMany(Picture, {polymorphic: { // alt syntax
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }});
          Picture.belongsTo('imageable', {polymorphic: {
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }});

          assert.deepStrictEqual(Article.relations['pictures'].toJSON(), {
            name: 'pictures',
            type: 'hasMany',
            modelFrom: 'Article',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'imageId',
            multiple: true,
            polymorphic: {
              selector: 'pictures',
              foreignKey: 'imageId',
              discriminator: 'imageType',
            },
          });

          assert.deepStrictEqual(Picture.relations['imageable'].toJSON(), {
            name: 'imageable',
            type: 'belongsTo',
            modelFrom: 'Picture',
            keyFrom: 'imageId',
            modelTo: '<polymorphic>',
            keyTo: 'id',
            multiple: false,
            polymorphic: {
              selector: 'imageable',
              foreignKey: 'imageId',
              discriminator: 'imageType',
            },
          });

          db.automigrate(['Picture', 'Article', 'Employee'], err => err ? reject(err) : resolve());
        });
      });
    });
    describe('polymorphic hasAndBelongsToMany through', function() {
      let idArticle, idEmployee;

      before(async function() {
        await new Promise((resolve, reject) => {
          idArticle = uid.fromConnector(db) || 3456;
          idEmployee = uid.fromConnector(db) || 4567;
          Picture = db.define('Picture', {name: String});
          Article = db.define('Article', {name: String});
          Employee = db.define('Employee', {name: String});
          PictureLink = db.define('PictureLink', {});

          db.automigrate(['Picture', 'Article', 'Employee', 'PictureLink'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared using default polymorphic selector', async function() {
        await new Promise((resolve, reject) => {
          Article.hasAndBelongsToMany(Picture, {through: PictureLink, polymorphic: 'imageable'});
          Employee.hasAndBelongsToMany(Picture, {through: PictureLink, polymorphic: 'imageable'});
          // Optionally, define inverse relations:
          Picture.hasMany(Article, {through: PictureLink, polymorphic: 'imageable', invert: true});
          Picture.hasMany(Employee, {through: PictureLink, polymorphic: 'imageable', invert: true});
          db.automigrate(['Picture', 'Article', 'Employee', 'PictureLink'], err => err ? reject(err) : resolve());
        });
      });

      it('can determine the collect via modelTo name', function() {
        Article.hasAndBelongsToMany(Picture, {through: PictureLink, polymorphic: 'imageable'});
        Employee.hasAndBelongsToMany(Picture, {through: PictureLink, polymorphic: 'imageable'});
        // Optionally, define inverse relations:
        Picture.hasMany(Article, {through: PictureLink, polymorphic: 'imageable', invert: true});
        Picture.hasMany(Employee, {through: PictureLink, polymorphic: 'imageable', invert: true});
        const article = new Article({id: idArticle});
        const scope1 = article.pictures._scope;
        assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'collect')); assert.strictEqual(scope1.collect, 'picture');
        assert.ok(Object.prototype.hasOwnProperty.call(scope1, 'include')); assert.strictEqual(scope1.include, 'picture');
        const employee = new Employee({id: idEmployee});
        const scope2 = employee.pictures._scope;
        assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'collect')); assert.strictEqual(scope2.collect, 'picture');
        assert.ok(Object.prototype.hasOwnProperty.call(scope2, 'include')); assert.strictEqual(scope2.include, 'picture');
        const picture = new Picture({id: idArticle});
        const scope3 = picture.articles._scope;
        assert.ok(Object.prototype.hasOwnProperty.call(scope3, 'collect')); assert.strictEqual(scope3.collect, 'imageable');
        assert.ok(Object.prototype.hasOwnProperty.call(scope3, 'include')); assert.strictEqual(scope3.include, 'imageable');
        const scope4 = picture.employees._scope;
        assert.ok(Object.prototype.hasOwnProperty.call(scope4, 'collect')); assert.strictEqual(scope4.collect, 'imageable');
        assert.ok(Object.prototype.hasOwnProperty.call(scope4, 'include')); assert.strictEqual(scope4.include, 'imageable');
      });

      let article, employee;
      const pictures = [];
      it('should create polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 1'}, function(err, a) {
            if (err) return reject(err);
            article = a;
            article.pictures.create({name: 'Article Pic 1'}, function(err, pic) {
              if (err) return reject(err);
              pictures.push(pic);
              article.pictures.create({name: 'Article Pic 2'}, function(err, pic) {
                if (err) return reject(err);
                pictures.push(pic);
                resolve();
              });
            });
          });
        });
      });

      it('should create polymorphic relation - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.create({name: 'Employee 1'}, function(err, r) {
            if (err) return reject(err);
            employee = r;
            employee.pictures.create({name: 'Employee Pic 1'}, function(err, pic) {
              if (err) return reject(err);
              pictures.push(pic);
              resolve();
            });
          });
        });
      });

      it('should create polymorphic through model', async function() {
        await new Promise((resolve, reject) => {
          PictureLink.findOne(function(err, link) {
            if (err) return reject(err);
            if (connectorCapabilities.adhocSort !== false) {
              assert.deepStrictEqual(link.pictureId, pictures[0].id);
              assert.deepStrictEqual(link.imageableId, article.id);
              assert.strictEqual(link.imageableType, 'Article');
              link.imageable(function(err, imageable) {
                assert.ok(imageable instanceof Article);
                assert.deepStrictEqual(imageable.id, article.id);
                resolve();
              });
            } else {
              const picIds = pictures.map(pic => pic.id.toString());
              assert.ok(picIds.includes(link.pictureId.toString()));
              assert.ok(('Article', 'Employee').includes(link.imageableType));
              link.imageable(function(err, imageable) {
                assert.ok((article.id, employee.id).includes(imageable.id));
                resolve();
              });
            }
          });
        });
      });

      it('should get polymorphic relation through model - article', async function() {
        await new Promise((resolve, reject) => {
          if (!article) return resolve();
          Article.findById(article.id, function(err, article) {
            if (err) return reject(err);
            assert.strictEqual(article.name, 'Article 1');
            article.pictures(function(err, pics) {
              if (err) return reject(err);
              assert.strictEqual(pics.length, 2);
              const names = pics.map(p => p.name);
              const expected = ['Article Pic 1', 'Article Pic 2'];
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(names, expected);
              } else {
                assert.ok((expected).every(item => names.includes(item)));
              }
              resolve();
            });
          });
        });
      });

      it('should get polymorphic relation through model - employee', async function() {
        await new Promise((resolve, reject) => {
          Employee.findById(employee.id, function(err, employee) {
            if (err) return reject(err);
            assert.strictEqual(employee.name, 'Employee 1');
            employee.pictures(function(err, pics) {
              if (err) return reject(err);
              assert.strictEqual(pics.length, 1);
              assert.strictEqual(pics[0].name, 'Employee Pic 1');
              resolve();
            });
          });
        });
      });

      it('should include polymorphic items', async function() {
        await new Promise((resolve, reject) => {
          Article.find({include: 'pictures'}, function(err, articles) {
            assert.strictEqual(articles.length, 1);
            if (!articles) return resolve();
            articles[0].pictures(function(err, pics) {
              assert.strictEqual(pics.length, 2);
              const names = pics.map(p => p.name);
              const expected = ['Article Pic 1', 'Article Pic 2'];
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(names, expected);
              } else {
                assert.ok((expected).every(item => names.includes(item)));
              }
              resolve();
            });
          });
        });
      });

      let anotherPicture;
      it('should add to a polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          if (!article) return resolve();
          Article.findById(article.id, function(err, article) {
            Picture.create({name: 'Example'}, function(err, pic) {
              if (err) return reject(err);
              pictures.push(pic);
              anotherPicture = pic;
              article.pictures.add(pic, function(err, link) {
                assert.ok(link instanceof PictureLink);
                assert.deepStrictEqual(link.pictureId, pic.id);
                assert.deepStrictEqual(link.imageableId, article.id);
                assert.strictEqual(link.imageableType, 'Article');
                resolve();
              });
            });
          });
        });
      });

      it('should create polymorphic through model', async function() {
        await new Promise((resolve, reject) => {
          if (!anotherPicture) return resolve();
          PictureLink.findOne({where: {pictureId: anotherPicture.id, imageableType: 'Article'}},
            function(err, link) {
              if (err) return reject(err);
              assert.deepStrictEqual(link.pictureId.toString(), anotherPicture.id.toString());
              assert.deepStrictEqual(link.imageableId.toString(), article.id.toString());
              assert.strictEqual(link.imageableType, 'Article');
              resolve();
            });
        });
      });

      let anotherArticle, anotherEmployee;
      it('should add to a polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Article.create({name: 'Article 2'}, function(err, article) {
            if (err) return reject(err);
            anotherArticle = article;
            if (!anotherPicture) return resolve();
            article.pictures.add(anotherPicture.id, function(err, pic) {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });

      it('should add to a polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          Employee.create({name: 'Employee 2'}, function(err, reader) {
            if (err) return reject(err);
            anotherEmployee = reader;
            if (!anotherPicture) return resolve();
            reader.pictures.add(anotherPicture.id, function(err, pic) {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });

      it('should get the inverse polymorphic relation - article', async function() {
        await new Promise((resolve, reject) => {
          if (!anotherPicture) return resolve();
          Picture.findById(anotherPicture.id, function(err, pic) {
            pic.articles(function(err, articles) {
              assert.strictEqual(articles.length, 2);
              const names = articles.map(pic => pic.name);
              const expected = ['Article 1', 'Article 2'];
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(names, expected);
              } else {
                assert.ok((expected).every(item => names.includes(item)));
              }
              resolve();
            });
          });
        });
      });

      it('should get the inverse polymorphic relation - reader', async function() {
        await new Promise((resolve, reject) => {
          if (!anotherPicture) return resolve();
          Picture.findById(anotherPicture.id, function(err, pic) {
            pic.employees(function(err, employees) {
              assert.strictEqual(employees.length, 1);
              if (connectorCapabilities.adhocSort !== false) {
                assert.strictEqual(employees[0].name, 'Employee 2');
              } else {
                const employeeNames = ['Employee 1', 'Employee 2'];
                assert.ok((employeeNames).includes(employees[0].name));
              }
              resolve();
            });
          });
        });
      });

      it('should find polymorphic items - article', async function() {
        await new Promise((resolve, reject) => {
          if (!article) return resolve();
          Article.findById(article.id, function(err, article) {
            article.pictures(function(err, pics) {
              assert.strictEqual(pics.length, 3);
              const names = pics.map(pic => pic.name);
              const expected = ['Article Pic 1', 'Article Pic 2', 'Example'];
              if (connectorCapabilities.adhocSort !== false) {
                assert.deepStrictEqual(names, expected);
              } else {
                assert.ok((expected).every(item => names.includes(item)));
              }
              resolve();
            });
          });
        });
      });

      it('should check if polymorphic relation exists - article', async function() {
        await new Promise((resolve, reject) => {
          if (!article) return resolve();
          Article.findById(article.id, function(err, article) {
            article.pictures.exists(anotherPicture.id, function(err, exists) {
              assert.strictEqual(exists, true);
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should remove from a polymorphic relation - article', async function() {
          await new Promise((resolve, reject) => {
            if (!article || !anotherPicture) return resolve();
            Article.findById(article.id, function(err, article) {
              article.pictures.remove(anotherPicture.id, function(err) {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
        'should find polymorphic items - article', async function() {
          await new Promise((resolve, reject) => {
            if (!article) return resolve();
            Article.findById(article.id, function(err, article) {
              article.pictures(function(err, pics) {
                // If deleteWithOtherThanId is not implemented, the above test is skipped and
                // the remove did not take place.  Thus +1.
                const expectedLength = connectorCapabilities.deleteWithOtherThanId !== false ?
                  2 : 3;
                assert.strictEqual(pics.length, expectedLength);

                const names = pics.map(p => p.name);
                if (connectorCapabilities.adhocSort !== false) {
                  assert.deepStrictEqual(names, ['Article Pic 1', 'Article Pic 2']);
                } else {
                  assert.ok((['Article Pic 1', 'Article Pic 2', 'Example']).every(item => names.includes(item)));
                }
                resolve();
              });
            });
          });
        });

      it('should check if polymorphic relation exists - article', async function() {
        await new Promise((resolve, reject) => {
          if (!article) return resolve();
          Article.findById(article.id, function(err, article) {
            article.pictures.exists(7, function(err, exists) {
              assert.strictEqual(exists, false);
              resolve();
            });
          });
        });
      });

      it('should create polymorphic item through relation scope', async function() {
        await new Promise((resolve, reject) => {
          if (!anotherPicture) return resolve();
          Picture.findById(anotherPicture.id, function(err, pic) {
            pic.articles.create({name: 'Article 3'}, function(err, prd) {
              if (err) return reject(err);
              article = prd;
              assert.strictEqual(article.name, 'Article 3');
              resolve();
            });
          });
        });
      });

      it('should create polymorphic through model - new article', async function() {
        await new Promise((resolve, reject) => {
          if (!article || !anotherPicture) return resolve();
          PictureLink.findOne({where: {
            pictureId: anotherPicture.id, imageableId: article.id, imageableType: 'Article',
          }}, function(err, link) {
            if (err) return reject(err);
            assert.deepStrictEqual(link.pictureId.toString(), anotherPicture.id.toString());
            assert.deepStrictEqual(link.imageableId.toString(), article.id.toString());
            assert.strictEqual(link.imageableType, 'Article');
            resolve();
          });
        });
      });

      it('should find polymorphic items - new article', async function() {
        await new Promise((resolve, reject) => {
          if (!article) return resolve();
          Article.findById(article.id, function(err, article) {
            article.pictures(function(err, pics) {
              assert.strictEqual(pics.length, 1);
              assert.deepStrictEqual(pics[0].id, anotherPicture.id);
              assert.strictEqual(pics[0].name, 'Example');
              resolve();
            });
          });
        });
      });

      it('should use author_pictures as modelThrough', async function() {
        await new Promise((resolve, reject) => {
          Article.hasAndBelongsToMany(Picture, {throughTable: 'article_pictures'});
          assert.deepStrictEqual(Article.relations['pictures'].toJSON(), {
            name: 'pictures',
            type: 'hasMany',
            modelFrom: 'Article',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'articleId',
            multiple: true,
            modelThrough: 'article_pictures',
            keyThrough: 'pictureId',
          });
          resolve();
        });
      });

      it('can be declared using custom foreignKey/discriminator', async function() {
        await new Promise((resolve, reject) => {
          Article.hasAndBelongsToMany(Picture, {through: PictureLink, polymorphic: {
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }});
          Employee.hasAndBelongsToMany(Picture, {through: PictureLink, polymorphic: {
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }});
          // Optionally, define inverse relations:
          Picture.hasMany(Article, {through: PictureLink, polymorphic: {
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }, invert: true});
          Picture.hasMany(Employee, {through: PictureLink, polymorphic: {
            foreignKey: 'imageId',
            discriminator: 'imageType',
          }, invert: true});

          assert.deepStrictEqual(Article.relations['pictures'].toJSON(), {
            name: 'pictures',
            type: 'hasMany',
            modelFrom: 'Article',
            keyFrom: 'id',
            modelTo: 'Picture',
            keyTo: 'imageId',
            multiple: true,
            modelThrough: 'PictureLink',
            keyThrough: 'pictureId',
            polymorphic: {
              selector: 'pictures',
              foreignKey: 'imageId',
              discriminator: 'imageType',
            },
          });

          assert.deepStrictEqual(Picture.relations['articles'].toJSON(), {
            name: 'articles',
            type: 'hasMany',
            modelFrom: 'Picture',
            keyFrom: 'id',
            modelTo: 'Article',
            keyTo: 'pictureId',
            multiple: true,
            modelThrough: 'PictureLink',
            keyThrough: 'imageId',
            polymorphic: {
              foreignKey: 'imageId',
              discriminator: 'imageType',
              selector: 'articles',
              invert: true,
            },
          });

          db.automigrate(['Picture', 'Article', 'Employee', 'PictureLink'], err => err ? reject(err) : resolve());
        });
      });
    });
    describe('belongsTo', function() {
      let List, Item, Fear, Mind;

      let listId, itemId;

      it('can be declared in different ways', function() {
        List = db.define('List', {name: String});
        Item = db.define('Item', {name: String});
        Fear = db.define('Fear');
        Mind = db.define('Mind');

        // syntax 1 (old)
        Item.belongsTo(List);
        assert.ok(Object.keys((new Item).toObject()).includes('listId'));
        assert.ok((new Item).list instanceof Function);

        // syntax 2 (new)
        Fear.belongsTo('mind', {
          methods: {check: function() { return true; }},
        });

        assert.ok(Object.keys((new Fear).toObject()).includes('mindId'));
        assert.ok((new Fear).mind instanceof Function);
        assert.ok((new Fear).mind.build() instanceof Mind);
      });

      it('should setup a custom method on accessor', function() {
        const rel = Fear.relations['mind'];
        rel.defineMethod('other', function() {
          return true;
        });
      });

      it('should have setup a custom method on accessor', function() {
        const f = new Fear();
        assert.strictEqual(typeof f.mind.check, 'function');
        assert.strictEqual(f.mind.check(), true);
        assert.strictEqual(typeof f.mind.other, 'function');
        assert.strictEqual(f.mind.other(), true);
      });

      it('can be used to query data', async function() {
        await new Promise((resolve, reject) => {
          List.hasMany('todos', {model: Item});
          db.automigrate(['List', 'Item', 'Fear', 'Mind'], function() {
            List.create({name: 'List 1'}, function(e, list) {
              listId = list.id;
              assert.ok(e == null);
              assert.ok(list != null);
              list.todos.create({name: 'Item 1'}, function(err, todo) {
                itemId = todo.id;
                todo.list(function(e, l) {
                  assert.ok(e == null);
                  assert.ok(l != null);
                  assert.ok(l instanceof List);
                  assert.deepStrictEqual(todo.list().id, l.id);
                  assert.strictEqual(todo.list().name, 'List 1');
                  resolve();
                });
              });
            });
          });
        });
      });

      it('can be used to query data with get() with callback', async function() {
        await new Promise((resolve, reject) => {
          List.hasMany('todos', {model: Item});
          db.automigrate(['List', 'Item', 'Fear', 'Find'], function() {
            List.create({name: 'List 1'}, function(e, list) {
              listId = list.id;
              assert.ok(e == null);
              assert.ok(list != null);
              list.todos.create({name: 'Item 1'}, function(err, todo) {
                itemId = todo.id;
                todo.list.get(function(e, l) {
                  assert.ok(e == null);
                  assert.ok(l != null);
                  assert.ok(l instanceof List);
                  assert.deepStrictEqual(todo.list().id, l.id);
                  assert.strictEqual(todo.list().name, 'List 1');
                  resolve();
                });
              });
            });
          });
        });
      });

      it('can be used to query data with promises', async function() {
        await new Promise((resolve, reject) => {
          List.hasMany('todos', {model: Item});
          db.automigrate(['List', 'Item', 'Fear', 'Find'], function() {
            List.create({name: 'List 1'})
              .then(function(list) {
                listId = list.id;
                assert.ok(list != null);
                return list.todos.create({name: 'Item 1'});
              })
              .then(function(todo) {
                itemId = todo.id;
                return todo.list.get()
                  .then(function(l) {
                    assert.ok(l != null);
                    assert.ok(l instanceof List);
                    assert.deepStrictEqual(todo.list().id, l.id);
                    assert.strictEqual(todo.list().name, 'List 1');
                    resolve();
                  });
              })
              .catch(reject);
          });
        });
      });

      it('could accept objects when creating on scope', async function() {
        await new Promise((resolve, reject) => {
          List.create(function(e, list) {
            assert.ok(e == null);
            assert.ok(list != null);
            Item.create({list: list}, function(err, item) {
              if (err) return reject(err);
              assert.ok(item != null);
              assert.ok(item.listId != null);
              assert.deepStrictEqual(item.listId, list.id);
              assert.strictEqual(item.__cachedRelations.list, list);
              resolve();
            });
          });
        });
      });

      it('should update related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Item.findById(itemId, function(e, todo) {
            todo.list.update({name: 'List A'}, function(err, list) {
              if (err) return reject(err);
              assert.ok(list != null);
              assert.strictEqual(list.name, 'List A');
              resolve();
            });
          });
        });
      });

      it('should not update related item FK on scope', async function() {
        await new Promise((resolve, reject) => {
          Item.findById(itemId, function(e, todo) {
            if (e) return reject(e);
            todo.list.update({id: 10}, function(err, list) {
              assert.ok(err != null);
              assert.ok(err.message.startsWith('Cannot override foreign key'));
              resolve();
            });
          });
        });
      });

      it('should get related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Item.findById(itemId, function(e, todo) {
            todo.list(function(err, list) {
              if (err) return reject(err);
              assert.ok(list != null);
              assert.strictEqual(list.name, 'List A');
              resolve();
            });
          });
        });
      });

      it('should destroy related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Item.findById(itemId, function(e, todo) {
            todo.list.destroy(function(err) {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });

      it('should get related item on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          Item.findById(itemId, function(e, todo) {
            todo.list(function(err, list) {
              if (err) return reject(err);
              assert.ok(list == null);
              resolve();
            });
          });
        });
      });

      it('should not have deleted related item', async function() {
        await new Promise((resolve, reject) => {
          List.findById(listId, function(e, list) {
            assert.ok(e == null);
            assert.ok(list != null);
            resolve();
          });
        });
      });

      it('should allow to create belongsTo model in beforeCreate hook', async function() {
        await new Promise((resolve, reject) => {
          let mind;
          Fear.beforeCreate = function(next) {
            this.mind.create(function(err, m) {
              mind = m;
              if (err) next(err); else next();
            });
          };
          Fear.create(function(err, fear) {
            assert.ok(err == null);
            assert.ok(fear != null);
            assert.deepStrictEqual(fear.mindId, mind.id);
            assert.ok(fear.mind() != null);
            resolve();
          });
        });
      });

      it('should allow to create belongsTo model in beforeCreate hook with promises', async function() {
        await new Promise((resolve, reject) => {
          let mind;
          Fear.beforeCreate = function(next) {
            this.mind.create()
              .then(function(m) {
                mind = m;
                next();
              }).catch(next);
          };
          Fear.create()
            .then(function(fear) {
              assert.ok(fear != null);
              assert.deepStrictEqual(fear.mindId, mind.id);
              assert.ok(fear.mind() != null);
              resolve();
            }).catch(reject);
        });
      });
    });
    describe('belongsTo with scope', function() {
      let Person, Passport;

      it('can be declared with scope and properties', async function() {
        await new Promise((resolve, reject) => {
          Person = db.define('Person', {name: String, age: Number, passportNotes: String});
          Passport = db.define('Passport', {name: String, notes: String});
          Passport.belongsTo(Person, {
            properties: {notes: 'passportNotes'},
            scope: {fields: {id: true, name: true}},
          });
          db.automigrate(['Person', 'Passport'], err => err ? reject(err) : resolve());
        });
      });

      let personCreated;
      it('should create record on scope', async function() {
        await new Promise((resolve, reject) => {
          const p = new Passport({name: 'Passport', notes: 'Some notes...'});
          p.person.create({name: 'Fred', age: 36}, function(err, person) {
            personCreated = person;
            assert.deepStrictEqual(p.personId.toString(), person.id.toString());
            assert.strictEqual(person.name, 'Fred');
            assert.strictEqual(person.passportNotes, 'Some notes...');
            p.save(function(err, passport) {
              assert.ok(err == null);
              resolve();
            });
          });
        });
      });

      it('should find record on scope', async function() {
        await new Promise((resolve, reject) => {
          Passport.findOne(function(err, p) {
            assert.deepStrictEqual(p.personId.toString(), personCreated.id.toString());
            p.person(function(err, person) {
              assert.strictEqual(person.name, 'Fred');
              assert.strictEqual(person.age, undefined);
              assert.strictEqual(person.passportNotes, undefined);
              resolve();
            });
          });
        });
      });

      it('should create record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          const p = new Passport({name: 'Passport', notes: 'Some notes...'});
          p.person.create({name: 'Fred', age: 36})
            .then(function(person) {
              assert.deepStrictEqual(p.personId, person.id);
              assert.strictEqual(person.name, 'Fred');
              assert.strictEqual(person.passportNotes, 'Some notes...');
              return p.save();
            })
            .then(function(passport) {
              resolve();
            })
            .catch(reject);
        });
      });

      it('should find record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Passport.findOne()
            .then(function(p) {
              if (connectorCapabilities.adhocSort !== false) {
                // We skip the check if adhocSort is not supported because
                // the first row returned may or may not be the same
                assert.deepStrictEqual(p.personId, personCreated.id);
              }
              return p.person.get();
            })
            .then(function(person) {
              assert.strictEqual(person.name, 'Fred');
              assert.strictEqual(person.age, undefined);
              assert.strictEqual(person.passportNotes, undefined);
              resolve();
            })
            .catch(reject);
        });
      });
    });
    // Disable the tests until the issue in
    // https://github.com/strongloop/loopback-datasource-juggler/pull/399
    // is fixed
    describe('belongsTo with embed', {skip: true}, function() {
      let Person, Passport;

      it('can be declared with embed and properties', async function() {
        await new Promise((resolve, reject) => {
          Person = db.define('Person', {name: String, age: Number});
          Passport = db.define('Passport', {name: String, notes: String});
          Passport.belongsTo(Person, {
            properties: ['name'],
            options: {embedsProperties: true, invertProperties: true},
          });
          db.automigrate(['Person', 'Passport'], err => err ? reject(err) : resolve());
        });
      });

      it('should create record with embedded data', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred', age: 36}, function(err, person) {
            const p = new Passport({name: 'Passport', notes: 'Some notes...'});
            p.person(person);
            assert.deepStrictEqual(p.personId, person.id);
            const data = p.toObject(true);
            assert.deepStrictEqual(data.person.id, person.id);
            assert.strictEqual(data.person.name, 'Fred');
            p.save(function(err) {
              assert.ok(err == null);
              resolve();
            });
          });
        });
      });

      it('should find record with embedded data', async function() {
        await new Promise((resolve, reject) => {
          Passport.findOne(function(err, p) {
            assert.ok(err == null);
            const data = p.toObject(true);
            assert.deepStrictEqual(data.person.id, p.personId);
            assert.strictEqual(data.person.name, 'Fred');
            resolve();
          });
        });
      });

      it('should find record with embedded data with promises', async function() {
        await new Promise((resolve, reject) => {
          Passport.findOne()
            .then(function(p) {
              const data = p.toObject(true);
              assert.deepStrictEqual(data.person.id, p.personId);
              assert.strictEqual(data.person.name, 'Fred');
              resolve();
            }).catch(reject);
        });
      });
    });
    describe('hasOne', function() {
      let Supplier, Account;
      let supplierId, accountId;

      before(function() {
        Supplier = db.define('Supplier', {name: String});
        Account = db.define('Account', {accountNo: String, supplierName: String});
      });

      it('can be declared using hasOne method', function() {
        Supplier.hasOne(Account, {
          properties: {name: 'supplierName'},
          methods: {check: function() { return true; }},
        });
        assert.ok(Object.keys((new Account()).toObject()).includes('supplierId'));
        assert.ok((new Supplier()).account instanceof Function);
      });

      it('should setup a custom method on accessor', function() {
        const rel = Supplier.relations['account'];
        rel.defineMethod('other', function() {
          return true;
        });
      });

      it('should have setup a custom method on accessor', function() {
        const s = new Supplier();
        assert.strictEqual(typeof s.account.check, 'function');
        assert.strictEqual(s.account.check(), true);
        assert.strictEqual(typeof s.account.other, 'function');
        assert.strictEqual(s.account.other(), true);
      });

      it('can be used to query data', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Supplier', 'Account'], function() {
            Supplier.create({name: 'Supplier 1'}, function(e, supplier) {
              supplierId = supplier.id;
              assert.ok(e == null);
              assert.ok(supplier != null);
              supplier.account.create({accountNo: 'a01'}, function(err, account) {
                supplier.account(function(e, act) {
                  accountId = act.id;
                  assert.ok(e == null);
                  assert.ok(act != null);
                  assert.ok(act instanceof Account);
                  assert.deepStrictEqual(supplier.account().id, act.id);
                  assert.strictEqual(act.supplierName, supplier.name);
                  resolve();
                });
              });
            });
          });
        });
      });

      it('can be used to query data with get() with callback', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Supplier', 'Account'], function() {
            Supplier.create({name: 'Supplier 1'}, function(e, supplier) {
              supplierId = supplier.id;
              assert.ok(e == null);
              assert.ok(supplier != null);
              supplier.account.create({accountNo: 'a01'}, function(err, account) {
                supplier.account.get(function(e, act) {
                  accountId = act.id;
                  assert.ok(e == null);
                  assert.ok(act != null);
                  assert.ok(act instanceof Account);
                  assert.deepStrictEqual(supplier.account().id, act.id);
                  assert.strictEqual(act.supplierName, supplier.name);
                  resolve();
                });
              });
            });
          });
        });
      });

      it('can be used to query data with promises', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Supplier', 'Account'], function() {
            Supplier.create({name: 'Supplier 1'})
              .then(function(supplier) {
                supplierId = supplier.id;
                assert.ok(supplier != null);
                return supplier.account.create({accountNo: 'a01'})
                  .then(function(account) {
                    return supplier.account.get();
                  })
                  .then(function(act) {
                    accountId = act.id;
                    assert.ok(act != null);
                    assert.ok(act instanceof Account);
                    assert.deepStrictEqual(supplier.account().id, act.id);
                    assert.strictEqual(act.supplierName, supplier.name);
                    resolve();
                  });
              })
              .catch(reject);
          });
        });
      });

      it('should set targetClass on scope property', function() {
        assert.strictEqual(Supplier.prototype.account._targetClass, 'Account');
      });

      it('should update the related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            supplier.account.update({supplierName: 'Supplier A'}, function(err, act) {
              assert.ok(e == null);
              assert.strictEqual(act.supplierName, 'Supplier A');
              resolve();
            });
          });
        });
      });

      it('should not update the related item FK on scope', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(err, supplier) {
            if (err) return reject(err);
            assert.ok(supplier != null);
            supplier.account.update({supplierName: 'Supplier A', supplierId: 10}, function(err, acct) {
              assert.ok(err != null);
              assert.ok(err.message.includes('Cannot override foreign key'));
              resolve();
            });
          });
        });
      });

      it('should update the related item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId)
            .then(function(supplier) {
              assert.ok(supplier != null);
              return supplier.account.update({supplierName: 'Supplier B'});
            })
            .then(function(act) {
              assert.strictEqual(act.supplierName, 'Supplier B');
              resolve();
            })
            .catch(reject);
        });
      });

      it('should error trying to change the foreign key in the update', async function() {
        await new Promise((resolve, reject) => {
          Supplier.create({name: 'Supplier 2'}, function(e, supplier) {
            const sid = supplier.id;
            Supplier.findById(supplierId, function(e, supplier) {
              assert.ok(e == null);
              assert.ok(supplier != null);
              supplier.account.update({supplierName: 'Supplier A',
                supplierId: sid},
              function(err, act) {
                assert.ok(err != null);
                assert.ok(err.message.startsWith('Cannot override foreign key'));
                resolve();
              });
            });
          });
        });
      });

      it('should update the related item on scope with same foreign key', async function() {
        await new Promise((resolve, reject) => {
          Supplier.create({name: 'Supplier 2'}, function(err, supplier) {
            Supplier.findById(supplierId, function(err, supplier) {
              if (err) return reject(err);
              assert.ok(supplier != null);
              supplier.account.update({supplierName: 'Supplier A',
                supplierId: supplierId},
              function(err, act) {
                if (err) return reject(err);
                assert.strictEqual(act.supplierName, 'Supplier A');
                assert.deepStrictEqual(act.supplierId.toString(), supplierId.toString());
                resolve();
              });
            });
          });
        });
      });

      it('should get the related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            supplier.account(function(err, act) {
              assert.ok(e == null);
              assert.ok(act != null);
              assert.strictEqual(act.supplierName, 'Supplier A');
              resolve();
            });
          });
        });
      });

      it('should get the related item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId)
            .then(function(supplier) {
              assert.ok(supplier != null);
              return supplier.account.get();
            })
            .then(function(act) {
              assert.ok(act != null);
              assert.strictEqual(act.supplierName, 'Supplier A');
              resolve();
            })
            .catch(reject);
        });
      });

      it('should destroy the related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            supplier.account.destroy(function(err) {
              assert.ok(e == null);
              resolve();
            });
          });
        });
      });

      it('should destroy the related item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId)
            .then(function(supplier) {
              assert.ok(supplier != null);
              return supplier.account.create({accountNo: 'a01'})
                .then(function(account) {
                  return supplier.account.destroy();
                })
                .then(function(err) {
                  resolve();
                });
            })
            .catch(reject);
        });
      });

      it('should get the related item on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            supplier.account(function(err, act) {
              assert.ok(e == null);
              assert.ok(act == null);
              resolve();
            });
          });
        });
      });

      it('should get the related item on scope with promises - verify', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId)
            .then(function(supplier) {
              assert.ok(supplier != null);
              return supplier.account.get();
            })
            .then(function(act) {
              assert.ok(act == null);
              resolve();
            })
            .catch(reject);
        });
      });

      it('should have deleted related item', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            resolve();
          });
        });
      });
    });
    describe('hasOne with scope', function() {
      let Supplier, Account;
      let supplierId, accountId;

      before(function() {
        Supplier = db.define('Supplier', {name: String});
        Account = db.define('Account', {accountNo: String, supplierName: String, block: Boolean});
        Supplier.hasOne(Account, {scope: {where: {block: false}}, properties: {name: 'supplierName'}});
      });

      it('can be used to query data', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Supplier', 'Account'], function() {
            Supplier.create({name: 'Supplier 1'}, function(e, supplier) {
              supplierId = supplier.id;
              assert.ok(e == null);
              assert.ok(supplier != null);
              supplier.account.create({accountNo: 'a01', block: false}, function(err, account) {
                supplier.account(function(e, act) {
                  accountId = act.id;
                  assert.ok(e == null);
                  assert.ok(act != null);
                  assert.ok(act instanceof Account);
                  assert.ok(act.block != null);
                  assert.strictEqual(act.block, false);
                  assert.deepStrictEqual(supplier.account().id, act.id);
                  assert.strictEqual(act.supplierName, supplier.name);
                  resolve();
                });
              });
            });
          });
        });
      });

      it('should include record that matches scope', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, {include: 'account'}, function(err, supplier) {
            assert.ok(supplier.toJSON().account != null);
            supplier.account(function(err, account) {
              assert.ok(account != null);
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.supportUpdateWithoutId !== false,
        'should not find record that does not match scope', async function() {
          await new Promise((resolve, reject) => {
            Account.updateAll({block: true}, function(err) {
              if (err) return reject(err);
              Supplier.findById(supplierId, function(err, supplier) {
                supplier.account(function(err, account) {
                  assert.ok(account == null);
                  resolve();
                });
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.supportUpdateWithoutId !== false,
        'should not include record that does not match scope', async function() {
          await new Promise((resolve, reject) => {
            Account.updateAll({block: true}, function(err) {
              if (err) return reject(err);
              Supplier.findById(supplierId, {include: 'account'}, function(err, supplier) {
                assert.ok(supplier.toJSON().account == null);
                supplier.account(function(err, account) {
                  assert.ok(account == null);
                  resolve();
                });
              });
            });
          });
        });

      it('can be used to query data with promises', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Supplier', 'Account'], function() {
            Supplier.create({name: 'Supplier 1'})
              .then(function(supplier) {
                supplierId = supplier.id;
                assert.ok(supplier != null);
                return supplier.account.create({accountNo: 'a01', block: false})
                  .then(function(account) {
                    return supplier.account.get();
                  })
                  .then(function(act) {
                    accountId = act.id;
                    assert.ok(act != null);
                    assert.ok(act instanceof Account);
                    assert.ok(act.block != null);
                    assert.strictEqual(act.block, false);
                    assert.deepStrictEqual(supplier.account().id, act.id);
                    assert.strictEqual(act.supplierName, supplier.name);
                    resolve();
                  });
              })
              .catch(reject);
          });
        });
      });

      bdd.itIf(connectorCapabilities.supportUpdateWithoutId !== false,
        'should find record that match scope with promises', async function() {
          await new Promise((resolve, reject) => {
            Account.updateAll({block: true})
              .then(function() {
                return Supplier.findById(supplierId);
              })
              .then(function(supplier) {
                return supplier.account.get();
              })
              .then(function(account) {
                assert.ok(account == null);
                resolve();
              })
              .catch(function(err) {
                resolve();
              });
          });
        });
    });
    describe('hasOne with non standard id', function() {
      let Supplier, Account;
      let supplierId, accountId;

      before(function() {
        Supplier = db.define('Supplier', {
          sid: {
            type: String,
            id: true,
            generated: true,
          },
          name: String,
        });
        Account = db.define('Account', {
          accid: {
            type: String,
            id: true,
            generated: false,
          },
          supplierName: String,
        });
      });

      it('can be declared with non standard foreignKey', function() {
        Supplier.hasOne(Account, {
          properties: {name: 'supplierName'},
          foreignKey: 'sid',
        });
        assert.ok(Object.keys((new Account()).toObject()).includes('sid'));
        assert.ok((new Supplier()).account instanceof Function);
      });

      it('can be used to query data', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Supplier', 'Account'], function() {
            Supplier.create({name: 'Supplier 1'}, function(e, supplier) {
              supplierId = supplier.sid;
              assert.ok(e == null);
              assert.ok(supplier != null);
              supplier.account.create({accid: 'a01'}, function(err, account) {
                supplier.account(function(e, act) {
                  accountId = act.accid;
                  assert.ok(e == null);
                  assert.ok(act != null);
                  assert.ok(act instanceof Account);
                  assert.deepStrictEqual(supplier.account().accid, act.accid);
                  assert.strictEqual(act.supplierName, supplier.name);
                  resolve();
                });
              });
            });
          });
        });
      });

      it('should destroy the related item on scope', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            supplier.account.destroy(function(err) {
              assert.ok(e == null);
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.cloudantCompatible !== false,
        'should get the related item on scope - verify', async function() {
          await new Promise((resolve, reject) => {
            Supplier.findById(supplierId, function(e, supplier) {
              assert.ok(e == null);
              assert.ok(supplier != null);
              supplier.account(function(err, act) {
                assert.ok(e == null);
                assert.ok(act == null);
                resolve();
              });
            });
          });
        });

      it('should have deleted related item', async function() {
        await new Promise((resolve, reject) => {
          Supplier.findById(supplierId, function(e, supplier) {
            assert.ok(e == null);
            assert.ok(supplier != null);
            resolve();
          });
        });
      });
    });
    describe('hasOne with primaryKey different from model PK', function() {
      let CompanyBoard, Boss;
      let companyBoardId, bossId;

      before(function() {
        CompanyBoard = db.define('CompanyBoard', {
          membersNumber: Number,
          companyId: String,
        });
        Boss = db.define('Boss', {
          id: {type: String, id: true, generated: false},
          boardMembersNumber: Number,
          companyId: String,
        });
      });

      it('relation can be declared with primaryKey', function() {
        CompanyBoard.hasOne(Boss, {
          properties: {membersNumber: 'boardMembersNumber'},
          primaryKey: 'companyId',
          foreignKey: 'companyId',
        });
        assert.ok(Object.keys((new Boss()).toObject()).includes('companyId'));
        assert.ok((new CompanyBoard()).boss instanceof Function);
      });

      it('can be used to query data', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['CompanyBoard', 'Boss'], function() {
            CompanyBoard.create({membersNumber: 7, companyId: 'Company1'}, function(e, companyBoard) {
              companyBoardId = companyBoard.id;
              assert.ok(e == null);
              assert.ok(companyBoard != null);
              companyBoard.boss.create({id: 'bossa01'}, function(err, account) {
                companyBoard.boss(function(e, boss) {
                  bossId = boss.id;
                  assert.ok(e == null);
                  assert.ok(boss != null);
                  assert.ok(boss instanceof Boss);
                  assert.deepStrictEqual(companyBoard.boss().id, boss.id);
                  assert.deepStrictEqual(boss.boardMembersNumber, companyBoard.membersNumber);
                  assert.deepStrictEqual(boss.companyId, companyBoard.companyId);
                  resolve();
                });
              });
            });
          });
        });
      });

      it('should destroy the related item on scope', async function() {
        await new Promise((resolve, reject) => {
          CompanyBoard.findById(companyBoardId, function(e, companyBoard) {
            assert.ok(e == null);
            assert.ok(companyBoard != null);
            companyBoard.boss.destroy(function(err) {
              assert.ok(e == null);
              resolve();
            });
          });
        });
      });

      it('should get the related item on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          CompanyBoard.findById(companyBoardId, function(e, companyBoard) {
            assert.ok(e == null);
            assert.ok(companyBoard != null);
            companyBoard.boss(function(err, act) {
              assert.ok(e == null);
              assert.ok(act == null);
              resolve();
            });
          });
        });
      });
    });
    describe('hasMany with primaryKey different from model PK', function() {
      let Employee, Boss;
      const COMPANY_ID = 'Company1';

      before(function() {
        Employee = db.define('Employee', {name: String, companyId: String});
        Boss = db.define('Boss', {address: String, companyId: String});
      });

      it('relation can be declared with primaryKey', function() {
        Boss.hasMany(Employee, {
          primaryKey: 'companyId',
          foreignKey: 'companyId',
        });
        assert.ok((new Boss()).employees instanceof Function);
      });

      it('can be used to query employees for boss', function() {
        return db.automigrate(['Employee', 'Boss']).then(function() {
          return Boss.create({address: 'testAddress', companyId: COMPANY_ID})
            .then(function(boss) {
              assert.ok(boss != null);
              assert.ok(boss.employees != null);
              return boss.employees.create([{name: 'a01'}, {name: 'a02'}])
                .then(function(employees) {
                  assert.ok(employees != null);
                  return boss.employees();
                }).then(function(employees) {
                  const employee = employees[0];
                  assert.ok(employee != null);
                  assert.strictEqual(employees.length, 2);
                  assert.ok(employee instanceof Employee);
                  assert.deepStrictEqual(employee.companyId, boss.companyId);
                  return employees;
                });
            });
        });
      });

      it('can be used to query employees for boss2', function() {
        return db.automigrate(['Employee', 'Boss']).then(function() {
          return Boss.create({address: 'testAddress', companyId: COMPANY_ID})
            .then(function(boss) {
              return Employee.create({name: 'a01', companyId: COMPANY_ID})
                .then(function(employee) {
                  assert.ok(employee != null);
                  return boss.employees.find();
                }).then(function(employees) {
                  assert.ok(employees != null);
                  assert.strictEqual(employees.length, 1);
                });
            });
        });
      });
    });

    describe('belongsTo with primaryKey different from model PK', function() {
      let Employee, Boss;
      const COMPANY_ID = 'Company1';
      let bossId;

      before(function() {
        Employee = db.define('Employee', {name: String, companyId: String});
        Boss = db.define('Boss', {address: String, companyId: String});
      });

      it('relation can be declared with primaryKey', function() {
        Employee.belongsTo(Boss, {
          primaryKey: 'companyId',
          foreignKey: 'companyId',
        });
        assert.ok((new Employee()).boss instanceof Function);
      });

      it('can be used to query data', function() {
        return db.automigrate(['Employee', 'Boss']).then(function() {
          return Boss.create({address: 'testAddress', companyId: COMPANY_ID})
            .then(function(boss) {
              bossId = boss.id;
              return Employee.create({name: 'a', companyId: COMPANY_ID});
            })
            .then(function(employee) {
              assert.ok(employee != null);
              return employee.boss.get();
            })
            .then(function(boss) {
              assert.ok(boss != null);
              assert.deepStrictEqual(boss.id, bossId);
            });
        });
      });
    });

    describe('hasAndBelongsToMany', function() {
      let Article, TagName, ArticleTag;
      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          Article = db.define('Article', {title: String});
          TagName = db.define('TagName', {name: String, flag: String});
          Article.hasAndBelongsToMany('tagNames');
          ArticleTag = db.models.ArticleTagName;
          db.automigrate(['Article', 'TagName', 'ArticleTagName'], err => err ? reject(err) : resolve());
        });
      });

      it('should allow to create instances on scope', async function() {
        await new Promise((resolve, reject) => {
          Article.create(function(e, article) {
            article.tagNames.create({name: 'popular'}, function(e, t) {
              assert.ok(t instanceof TagName);
              ArticleTag.findOne(function(e, at) {
                assert.ok(at != null);
                assert.deepStrictEqual(at.tagNameId.toString(), t.id.toString());
                assert.deepStrictEqual(at.articleId.toString(), article.id.toString());
                resolve();
              });
            });
          });
        });
      });

      it('should allow to fetch scoped instances', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne(function(e, article) {
            article.tagNames(function(e, tags) {
              assert.ok(e == null);
              assert.ok(tags != null);

              assert.deepStrictEqual(article.tagNames(), tags);

              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should destroy all related instances', async function() {
          await new Promise((resolve, reject) => {
            Article.create(function(err, article) {
              if (err) return reject(err);
              article.tagNames.create({name: 'popular'}, function(err, t) {
                if (err) return reject(err);
                article.tagNames.destroyAll(function(err) {
                  if (err) return reject(err);
                  article.tagNames(true, function(err, list) {
                    if (err) return reject(err);
                    assert.strictEqual(list.length, 0);
                    resolve();
                  });
                });
              });
            });
          });
        });

      it('should allow to add connection with instance', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne(function(e, article) {
            TagName.create({name: 'awesome'}, function(e, tag) {
              article.tagNames.add(tag, function(e, at) {
                assert.ok(e == null);
                assert.ok(at != null);
                assert.ok(at instanceof ArticleTag);
                assert.deepStrictEqual(at.tagNameId, tag.id);
                assert.deepStrictEqual(at.articleId, article.id);
                resolve();
              });
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should allow to remove connection with instance', async function() {
          await new Promise((resolve, reject) => {
            Article.findOne(function(e, article) {
              article.tagNames(function(e, tags) {
                const len = tags.length;
                assert.notStrictEqual(tags.length, 0);
                article.tagNames.remove(tags[0], function(e) {
                  assert.ok(e == null);
                  article.tagNames(true, function(e, tags) {
                    assert.strictEqual(tags.length, len - 1);
                    resolve();
                  });
                });
              });
            });
          });
        });

      it('should allow to create instances on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Article', 'TagName', 'ArticleTagName'], function() {
            Article.create()
              .then(function(article) {
                return article.tagNames.create({name: 'popular'})
                  .then(function(t) {
                    assert.ok(t instanceof TagName);
                    return ArticleTag.findOne()
                      .then(function(at) {
                        assert.ok(at != null);
                        assert.deepStrictEqual(at.tagNameId.toString(), t.id.toString());
                        assert.deepStrictEqual(at.articleId.toString(), article.id.toString());
                        resolve();
                      });
                  });
              }).catch(reject);
          });
        });
      });

      it('should allow to fetch scoped instances with promises', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne()
            .then(function(article) {
              return article.tagNames.find()
                .then(function(tags) {
                  assert.ok(tags != null);
                  assert.deepStrictEqual(article.tagNames(), tags);
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should allow to add connection with instance with promises', async function() {
        await new Promise((resolve, reject) => {
          Article.findOne()
            .then(function(article) {
              return TagName.create({name: 'awesome'})
                .then(function(tag) {
                  return article.tagNames.add(tag)
                    .then(function(at) {
                      assert.ok(at != null);
                      assert.ok(at instanceof ArticleTag);
                      assert.deepStrictEqual(at.tagNameId, tag.id);
                      assert.deepStrictEqual(at.articleId, article.id);
                      resolve();
                    });
                });
            })
            .catch(reject);
        });
      });

      bdd.itIf(connectorCapabilities.deleteWithOtherThanId !== false,
        'should allow to remove connection with instance with promises', async function() {
          await new Promise((resolve, reject) => {
            Article.findOne()
              .then(function(article) {
                return article.tagNames.find()
                  .then(function(tags) {
                    const len = tags.length;
                    assert.notStrictEqual(tags.length, 0);
                    return article.tagNames.remove(tags[0])
                      .then(function() {
                        return article.tagNames.find();
                      })
                      .then(function(tags) {
                        assert.strictEqual(tags.length, len - 1);
                        resolve();
                      });
                  });
              })
              .catch(reject);
          });
        });

      it('should set targetClass on scope property', function() {
        assert.strictEqual(Article.prototype.tagNames._targetClass, 'TagName');
      });

      it('should apply inclusion fields to the target model', async function() {
        await new Promise((resolve, reject) => {
          Article.create({title: 'a1'}, function(e, article) {
            assert.ok(e == null);
            article.tagNames.create({name: 't1', flag: '1'}, function(e, t) {
              assert.ok(e == null);
              Article.find({
                where: {id: article.id},
                include: {relation: 'tagNames', scope: {fields: ['name']}}},
              function(e, articles) {
                assert.ok(e == null);
                assert.ok(Object.prototype.hasOwnProperty.call(articles, 'length')); assert.strictEqual(articles.length, 1);
                const a = articles[0].toJSON();
                assert.ok(Object.prototype.hasOwnProperty.call(a, 'title')); assert.strictEqual(a.title, 'a1');
                assert.ok(Object.prototype.hasOwnProperty.call(a, 'tagNames'));
                assert.ok(Object.prototype.hasOwnProperty.call(a.tagNames, 'length')); assert.strictEqual(a.tagNames.length, 1);
                const n = a.tagNames[0];
                assert.ok(Object.prototype.hasOwnProperty.call(n, 'name')); assert.strictEqual(n.name, 't1');
                assert.ok(Object.prototype.hasOwnProperty.call(n, 'flag')); assert.strictEqual(n.flag, undefined);
                assert.deepStrictEqual(n.id, t.id);
                resolve();
              });
            });
          });
        });
      });

      it('should apply inclusion where to the target model', async function() {
        await new Promise((resolve, reject) => {
          Article.create({title: 'a2'}, function(e, article) {
            assert.ok(e == null);
            article.tagNames.create({name: 't2', flag: '2'}, function(e, t2) {
              assert.ok(e == null);
              article.tagNames.create({name: 't3', flag: '3'}, function(e, t3) {
                Article.find({
                  where: {id: article.id},
                  include: {relation: 'tagNames', scope: {where: {flag: '2'}}}},
                function(e, articles) {
                  assert.ok(e == null);
                  assert.ok(Object.prototype.hasOwnProperty.call(articles, 'length')); assert.strictEqual(articles.length, 1);
                  const a = articles[0].toJSON();
                  assert.ok(Object.prototype.hasOwnProperty.call(a, 'title')); assert.strictEqual(a.title, 'a2');
                  assert.ok(Object.prototype.hasOwnProperty.call(a, 'tagNames'));
                  assert.ok(Object.prototype.hasOwnProperty.call(a.tagNames, 'length')); assert.strictEqual(a.tagNames.length, 1);
                  const n = a.tagNames[0];
                  assert.ok(Object.prototype.hasOwnProperty.call(n, 'name')); assert.strictEqual(n.name, 't2');
                  assert.ok(Object.prototype.hasOwnProperty.call(n, 'flag')); assert.strictEqual(n.flag, '2');
                  assert.deepStrictEqual(n.id, t2.id);
                  resolve();
                });
              });
            });
          });
        });
      });
    });
    describe('embedsOne', function() {
      let person;
      let Passport;
      let Other;

      before(function() {
        tmp = getTransientDataSource();
        Person = db.define('Person', {name: String});
        Passport = tmp.define('Passport',
          {name: {type: 'string', required: true}},
          {idInjection: false});
        Address = tmp.define('Address', {street: String}, {idInjection: false});
        Other = db.define('Other', {name: String});
        Person.embedsOne(Passport, {
          default: {name: 'Anonymous'}, // a bit contrived
          methods: {check: function() { return true; }},
          options: {
            property: {
              postgresql: {
                columnName: 'passport_item',
              },
            },
          },
        });
      });

      it('can be declared using embedsOne method', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsOne(Address); // all by default
          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('should have setup a property and accessor', function() {
        const p = new Person();
        assert.ok(p.passport && typeof p.passport === 'object'); // because of default
        assert.strictEqual(typeof p.passportItem, 'function');
        assert.strictEqual(typeof p.passportItem.create, 'function');
        assert.strictEqual(typeof p.passportItem.build, 'function');
        assert.strictEqual(typeof p.passportItem.destroy, 'function');
      });

      it('respects property options on the embedded property', function() {
        assert.ok(Object.prototype.hasOwnProperty.call(Person.definition.properties.passport, 'postgresql'));
        assert.deepStrictEqual(Person.definition.properties.passport.postgresql, {columnName: 'passport_item'});
      });

      it('should setup a custom method on accessor', function() {
        const rel = Person.relations['passportItem'];
        rel.defineMethod('other', function() {
          return true;
        });
      });

      it('should have setup a custom method on accessor', function() {
        const p = new Person();
        assert.strictEqual(typeof p.passportItem.check, 'function');
        assert.strictEqual(p.passportItem.check(), true);
        assert.strictEqual(typeof p.passportItem.other, 'function');
        assert.strictEqual(p.passportItem.other(), true);
      });

      it('should behave properly without default or being set', async function() {
        await new Promise((resolve, reject) => {
          const p = new Person();
          assert.ok(p.address == null);
          const a = p.addressItem();
          assert.ok(a == null);
          Person.create({}, function(err, p) {
            assert.ok(p.address == null);
            const a = p.addressItem();
            assert.ok(a == null);
            resolve();
          });
        });
      });

      it('should return an instance with default values', function() {
        const p = new Person();
        assert.deepStrictEqual(p.passport.toObject(), {name: 'Anonymous'});
        assert.strictEqual(p.passportItem(), p.passport);
        p.passportItem(function(err, passport) {
          assert.ok(err == null);
          assert.strictEqual(passport, p.passport);
        });
      });

      it('should embed a model instance', function() {
        const p = new Person();
        p.passportItem(new Passport({name: 'Fred'}));
        assert.deepStrictEqual(p.passport.toObject(), {name: 'Fred'});
        assert.ok(p.passport instanceof Passport);
      });

      it('should not embed an invalid model type', function() {
        const p = new Person();
        p.passportItem(new Other());
        assert.deepStrictEqual(p.passport.toObject(), {name: 'Anonymous'});
        assert.ok(p.passport instanceof Passport);
      });

      let personId;
      it('should create an embedded item on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            if (err) return reject(err);
            personId = p.id;
            p.passportItem.create({name: 'Fredric'}, function(err, passport) {
              if (err) return reject(err);
              assert.deepStrictEqual(p.passport.toObject(), {name: 'Fredric'});
              assert.ok(p.passport instanceof Passport);
              resolve();
            });
          });
        });
      });

      it('should get an embedded item on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId, function(err, p) {
            if (err) return reject(err);
            const passport = p.passportItem();
            assert.deepStrictEqual(passport.toObject(), {name: 'Fredric'});
            assert.ok(passport instanceof Passport);
            assert.strictEqual(passport, p.passport);
            assert.strictEqual(passport, p.passportItem.value());
            resolve();
          });
        });
      });

      it('should validate an embedded item on scope - on creation', async function() {
        await new Promise((resolve, reject) => {
          const p = new Person({name: 'Fred'});
          p.passportItem.create({}, function(err, passport) {
            assert.ok(err != null);
            assert.strictEqual(err.name, 'ValidationError');
            assert.deepStrictEqual(err.details.messages.name, ['can\'t be blank']);
            resolve();
          });
        });
      });

      it('should validate an embedded item on scope - on update', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId, function(err, p) {
            const passport = p.passportItem();
            passport.name = null;
            p.save(function(err) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(
                err.details.messages.passportItem,
                ['is invalid: `name` can\'t be blank'],
              );
              resolve();
            });
          });
        });
      });

      it('should update an embedded item on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId, function(err, p) {
            p.passportItem.update({name: 'Freddy'}, function(err, passport) {
              if (err) return reject(err);
              passport = p.passportItem();
              assert.deepStrictEqual(passport.toObject(), {name: 'Freddy'});
              assert.ok(passport instanceof Passport);
              assert.strictEqual(passport, p.passport);
              resolve();
            });
          });
        });
      });

      it('should get an embedded item on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId, function(err, p) {
            if (err) return reject(err);
            const passport = p.passportItem();
            assert.deepStrictEqual(passport.toObject(), {name: 'Freddy'});
            resolve();
          });
        });
      });

      it('should destroy an embedded item on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId, function(err, p) {
            p.passportItem.destroy(function(err) {
              if (err) return reject(err);
              assert.strictEqual(p.passport, null);
              resolve();
            });
          });
        });
      });

      it('should get an embedded item on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId, function(err, p) {
            if (err) return reject(err);
            assert.strictEqual(p.passport, null);
            resolve();
          });
        });
      });

      it('should save an unsaved model', async function() {
        await new Promise((resolve, reject) => {
          const p = new Person({name: 'Fred'});
          assert.strictEqual(p.isNewRecord(), true);
          p.passportItem.create({name: 'Fredric'}, function(err, passport) {
            if (err) return reject(err);
            assert.strictEqual(p.passport, passport);
            assert.strictEqual(p.isNewRecord(), false);
            resolve();
          });
        });
      });

      it('should create an embedded item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'})
            .then(function(p) {
              personId = p.id;
              p.passportItem.create({name: 'Fredric'})
                .then(function(passport) {
                  assert.deepStrictEqual(p.passport.toObject(), {name: 'Fredric'});
                  assert.ok(p.passport instanceof Passport);
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should get an embedded item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId)
            .then(function(p) {
              const passport = p.passportItem();
              assert.deepStrictEqual(passport.toObject(), {name: 'Fredric'});
              assert.ok(passport instanceof Passport);
              assert.strictEqual(passport, p.passport);
              assert.strictEqual(passport, p.passportItem.value());
              resolve();
            }).catch(reject);
        });
      });

      it('should validate an embedded item on scope with promises - on creation', async function() {
        await new Promise((resolve, reject) => {
          const p = new Person({name: 'Fred'});
          p.passportItem.create({})
            .then(function(passport) {
              assert.ok(passport == null);
              resolve();
            })
            .catch(function(err) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(err.details.messages.name, ['can\'t be blank']);
              resolve();
            }).catch(reject);
        });
      });

      it('should validate an embedded item on scope with promises - on update', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId)
            .then(function(p) {
              const passport = p.passportItem();
              passport.name = null;
              return p.save()
                .then(function(p) {
                  assert.ok(p == null);
                  resolve();
                })
                .catch(function(err) {
                  assert.ok(err != null);
                  assert.strictEqual(err.name, 'ValidationError');
                  assert.deepStrictEqual(
                    err.details.messages.passportItem,
                    ['is invalid: `name` can\'t be blank'],
                  );
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should update an embedded item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId)
            .then(function(p) {
              return p.passportItem.update({name: 'Jason'})
                .then(function(passport) {
                  passport = p.passportItem();
                  assert.deepStrictEqual(passport.toObject(), {name: 'Jason'});
                  assert.ok(passport instanceof Passport);
                  assert.strictEqual(passport, p.passport);
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should get an embedded item on scope with promises - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId)
            .then(function(p) {
              const passport = p.passportItem();
              assert.deepStrictEqual(passport.toObject(), {name: 'Jason'});
              resolve();
            }).catch(reject);
        });
      });

      it('should destroy an embedded item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId)
            .then(function(p) {
              return p.passportItem.destroy()
                .then(function() {
                  assert.strictEqual(p.passport, null);
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should get an embedded item on scope with promises - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(personId)
            .then(function(p) {
              assert.strictEqual(p.passport, null);
              resolve();
            }).catch(reject);
        });
      });

      it('should also save changes when directly saving the embedded model', async function() {
        await new Promise((resolve, reject) => {
          // Passport should normally have an id for the direct save to work. For now override the check
          const originalHasPK = Passport.definition.hasPK;
          Passport.definition.hasPK = function() { return true; };
          Person.findById(personId)
            .then(function(p) {
              return p.passportItem.create({name: 'Mitsos'});
            })
            .then(function(passport) {
              passport.name = 'Jim';
              return passport.save();
            })
            .then(function() {
              return Person.findById(personId);
            })
            .then(function(person) {
              assert.deepStrictEqual(person.passportItem().toObject(), {name: 'Jim'});
              // restore original hasPk
              Passport.definition.hasPK = originalHasPK;
              resolve();
            })
            .catch(function(err) {
              Passport.definition.hasPK = originalHasPK;
              if (err) reject(err); else resolve();
            });
        });
      });

      it('should delete the embedded document and also update parent', async function() {
        await new Promise((resolve, reject) => {
          const originalHasPK = Passport.definition.hasPK;
          Passport.definition.hasPK = function() { return true; };
          Person.findById(personId)
            .then(function(p) {
              return p.passportItem().destroy();
            })
            .then(function() {
              return Person.findById(personId);
            })
            .then(function(person) {
              assert.strictEqual(person.passport, null);
              resolve();
            })
            .catch(function(err) {
              Passport.definition.hasPK = originalHasPK;
              if (err) reject(err); else resolve();
            });
        });
      });
    });
    describe('embedsOne - persisted model', function() {
    // This test spefically uses the Memory connector
    // in order to test the use of the auto-generated
    // id, in the sequence of the related model.
      let Passport, Person;
      before(function() {
        db = getMemoryDataSource();
        Person = db.define('Person', {name: String});
        Passport = db.define('Passport',
          {name: {type: 'string', required: true}});
      });

      it('can be declared using embedsOne method', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsOne(Passport, {
            options: {persistent: true},
          });
          db.automigrate(['Person', 'Passport'], err => err ? reject(err) : resolve());
        });
      });

      it('should create an item - to offset id', async function() {
        await new Promise((resolve, reject) => {
          Passport.create({name: 'Wilma'}, function(err, p) {
            if (err) return reject(err);
            assert.strictEqual(p.id, 1);
            assert.strictEqual(p.name, 'Wilma');
            resolve();
          });
        });
      });

      it('should create an embedded item on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            if (err) return reject(err);
            p.passportItem.create({name: 'Fredric'}, function(err, passport) {
              if (err) return reject(err);
              assert.deepStrictEqual(p.passport.id, 2);
              assert.strictEqual(p.passport.name, 'Fredric');
              resolve();
            });
          });
        });
      });

      it('should create an embedded item on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Barney'})
            .then(function(p) {
              return p.passportItem.create({name: 'Barnabus'})
                .then(function(passport) {
                  assert.deepStrictEqual(p.passport.id, 3);
                  assert.strictEqual(p.passport.name, 'Barnabus');
                  resolve();
                });
            }).catch(reject);
        });
      });
    });
    describe('embedsOne - generated id', function() {
      let Passport;
      before(function() {
        tmp = getTransientDataSource();
        Person = db.define('Person', {name: String});
        Passport = tmp.define('Passport',
          {
            id: {type: 'string', id: true, generated: true},
            name: {type: 'string', required: true},
          });
      });

      it('can be declared using embedsOne method', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsOne(Passport);
          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('should create an embedded item on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            if (err) return reject(err);
            p.passportItem.create({name: 'Fredric'}, function(err, passport) {
              if (err) return reject(err);
              assert.match(passport.id, /^[0-9a-fA-F]{24}$/);
              assert.strictEqual(p.passport.name, 'Fredric');
              resolve();
            });
          });
        });
      });
    });
    describe('embedsMany', function() {
      let address1, address2;

      before(async function() {
        await new Promise((resolve, reject) => {
          tmp = getTransientDataSource({defaultIdType: Number});
          Person = db.define('Person', {name: String});
          Address = tmp.define('Address', {street: String});
          Address.validatesPresenceOf('street');

          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsMany(Address, {
            options: {
              property: {
                postgresql: {
                  dataType: 'json',
                },
              },
            },
          });
          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('should have setup embedded accessor/scope', function() {
        const p = new Person({name: 'Fred'});
        assert.ok(Array.isArray(p.addresses));
        assert.strictEqual(p.addresses.length, 0);
        assert.strictEqual(typeof p.addressList, 'function');
        assert.strictEqual(typeof p.addressList.findById, 'function');
        assert.strictEqual(typeof p.addressList.updateById, 'function');
        assert.strictEqual(typeof p.addressList.destroy, 'function');
        assert.strictEqual(typeof p.addressList.exists, 'function');
        assert.strictEqual(typeof p.addressList.create, 'function');
        assert.strictEqual(typeof p.addressList.build, 'function');
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            p.addressList.create({street: 'Street 1'}, function(err, address) {
              if (err) return reject(err);
              address1 = address;
              assert.ok(address1.id != null);
              assert.strictEqual(address1.street, 'Street 1');
              resolve();
            });
          });
        });
      });

      it('respects property options on the embedded property', function() {
        assert.ok(Object.prototype.hasOwnProperty.call(Person.definition.properties.addresses, 'postgresql'));
        assert.deepStrictEqual(Person.definition.properties.addresses.postgresql, {dataType: 'json'});
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.create({street: 'Street 2'}, function(err, address) {
              if (err) return reject(err);
              address2 = address;
              assert.ok(address2.id != null);
              assert.strictEqual(address2.street, 'Street 2');
              resolve();
            });
          });
        });
      });

      it('should return embedded items from scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList(function(err, addresses) {
              if (err) return reject(err);

              const list = p.addressList();
              assert.strictEqual(list, addresses);
              assert.strictEqual(list, p.addresses);

              assert.strictEqual(p.addressList.value(), list);

              assert.strictEqual(addresses.length, 2);
              assert.deepStrictEqual(addresses[0].id, address1.id);
              assert.strictEqual(addresses[0].street, 'Street 1');
              assert.deepStrictEqual(addresses[1].id, address2.id);
              assert.strictEqual(addresses[1].street, 'Street 2');
              resolve();
            });
          });
        });
      });

      it('should filter embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList({where: {street: 'Street 2'}}, function(err, addresses) {
              if (err) return reject(err);
              assert.strictEqual(addresses.length, 1);
              assert.deepStrictEqual(addresses[0].id, address2.id);
              assert.strictEqual(addresses[0].street, 'Street 2');
              resolve();
            });
          });
        });
      });

      it('should validate embedded items', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.create({}, function(err, address) {
              assert.ok(err != null);
              assert.ok(address == null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(err.details.codes.street, ['presence']);
              resolve();
            });
          });
        });
      });

      it('should find embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.findById(address2.id, function(err, address) {
              assert.ok(address instanceof Address);
              assert.deepStrictEqual(address.id, address2.id);
              assert.strictEqual(address.street, 'Street 2');
              resolve();
            });
          });
        });
      });

      it('should check if item exists', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.exists(address2.id, function(err, exists) {
              if (err) return reject(err);
              assert.strictEqual(exists, true);
              resolve();
            });
          });
        });
      });

      it('should update embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.updateById(address2.id, {street: 'New Street'}, function(err, address) {
              assert.ok(address instanceof Address);
              assert.deepStrictEqual(address.id, address2.id);
              assert.strictEqual(address.street, 'New Street');
              resolve();
            });
          });
        });
      });

      it('should validate the update of embedded items', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.updateById(address2.id, {street: null}, function(err, address) {
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(err.details.codes.street, ['presence']);
              resolve();
            });
          });
        });
      });

      it('should find embedded items by id - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.findById(address2.id, function(err, address) {
              assert.ok(address instanceof Address);
              assert.deepStrictEqual(address.id, address2.id);
              assert.strictEqual(address.street, 'New Street');
              resolve();
            });
          });
        });
      });

      it('should have accessors: at, get, set', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.deepStrictEqual(p.addressList.at(0).id, address1.id);
            assert.deepStrictEqual(p.addressList.get(address1.id).id, address1.id);
            p.addressList.set(address1.id, {street: 'Changed 1'});
            assert.strictEqual(p.addresses[0].street, 'Changed 1');
            assert.deepStrictEqual(p.addressList.at(1).id, address2.id);
            assert.deepStrictEqual(p.addressList.get(address2.id).id, address2.id);
            p.addressList.set(address2.id, {street: 'Changed 2'});
            assert.strictEqual(p.addresses[1].street, 'Changed 2');
            resolve();
          });
        });
      });

      it('should remove embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 2);
            p.addressList.destroy(address1.id, function(err) {
              if (err) return reject(err);
              assert.strictEqual(p.addresses.length, 1);
              resolve();
            });
          });
        });
      });

      it('should have removed embedded items - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 1);
            resolve();
          });
        });
      });

      it('should pass options when removed by id', async function() {
        await new Promise((resolve, reject) => {
          const verifyOptions = function(ctx, next) {
            if (!ctx.options || !ctx.options.verify) {
              return next(new Error('options or options.verify is missing'));
            }
            return next();
          };
          Person.observe('before save', verifyOptions);
          Person.findOne(function(err, p) {
            p.addressList.create({street: 'options 1'}, {verify: true}, function(err, address) {
              if (err) {
                Person.clearObservers('before save');
                return reject(err);
              }
              p.addressList.destroy(address.id, {verify: true}, function(err) {
                if (err) {
                  Person.clearObservers('before save');
                  return reject(err);
                }
                Person.findById(p.id, function(err, verify) {
                  if (err) {
                    Person.clearObservers('before save');
                    return reject(err);
                  }
                  assert.strictEqual(verify.addresses.length, 1);
                  Person.clearObservers('before save');
                  resolve();
                });
              });
            });
          });
        });
      });

      it('should pass options when removed by where', async function() {
        await new Promise((resolve, reject) => {
          const verifyOptions = function(ctx, next) {
            if (!ctx.options || !ctx.options.verify) {
              return next(new Error('options or options.verify is missing'));
            }
            return next();
          };
          Person.observe('before save', verifyOptions);
          Person.findOne(function(err, p) {
            p.addressList.create({street: 'options 2'}, {verify: true}, function(err, address) {
              if (err) {
                Person.clearObservers('before save');
                return reject(err);
              }
              p.addressList.destroyAll({street: 'options 2'}, {verify: true}, function(err) {
                if (err) {
                  Person.clearObservers('before save');
                  return reject(err);
                }
                Person.findById(p.id, function(err, verify) {
                  if (err) {
                    Person.clearObservers('before save');
                    return reject(err);
                  }
                  assert.strictEqual(verify.addresses.length, 1);
                  Person.clearObservers('before save');
                  resolve();
                });
              });
            });
          });
        });
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.create({street: 'Street 3'}, function(err, address) {
              if (err) return reject(err);
              assert.strictEqual(address.street, 'Street 3');
              resolve();
            });
          });
        });
      });

      it('should remove embedded items - filtered', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 2);
            p.addressList.destroyAll({street: 'Street 3'}, function(err) {
              if (err) return reject(err);
              assert.strictEqual(p.addresses.length, 1);
              resolve();
            });
          });
        });
      });

      it('should remove all embedded items', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 1);
            p.addressList.destroyAll(function(err) {
              if (err) return reject(err);
              assert.strictEqual(p.addresses.length, 0);
              resolve();
            });
          });
        });
      });

      it('should have removed all embedded items - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 0);
            resolve();
          });
        });
      });

      it('should save an unsaved model', async function() {
        await new Promise((resolve, reject) => {
          const p = new Person({name: 'Fred'});
          assert.strictEqual(p.isNewRecord(), true);
          p.addressList.create({street: 'Street 4'}, function(err, address) {
            if (err) return reject(err);
            assert.strictEqual(address.street, 'Street 4');
            assert.strictEqual(p.isNewRecord(), false);
            resolve();
          });
        });
      });
    });
    describe('embedsMany - omit default value for embedded item', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          tmp = getTransientDataSource({defaultIdType: Number});
          Person = db.define('Person', {name: String});
          Address = tmp.define('Address', {street: String});
          Address.validatesPresenceOf('street');

          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsMany(Address, {
            options: {
              omitDefaultEmbeddedItem: true,
              property: {
                postgresql: {
                  dataType: 'json',
                },
              },
            },
          });
          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('should not set default value for embedded item', function() {
        const p = new Person({name: 'Fred'});
        assert.strictEqual(p.addresses, undefined);
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            p.addressList.create({street: 'Street 1'}, function(err, address) {
              if (err) return reject(err);
              assert.ok(address.id != null);
              assert.strictEqual(address.street, 'Street 1');
              assert.ok(Array.isArray(p.addresses));
              assert.strictEqual(p.addresses.length, 1);
              resolve();
            });
          });
        });
      });

      it('should build embedded items', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 1);
            p.addressList.build({id: 'home', street: 'Home'});
            p.addressList.build({id: 'work', street: 'Work'});
            assert.strictEqual(p.addresses.length, 3);
            resolve();
          });
        });
      });

      it('should not create embedded from attributes - relation name', async function() {
        await new Promise((resolve, reject) => {
          const addresses = [
            {id: 'home', street: 'Home Street'},
            {id: 'work', street: 'Work Street'},
          ];
          Person.create({name: 'Wilma', addressList: addresses}, function(err, p) {
            if (err) return reject(err);
            assert.strictEqual(p.addresses, undefined);
            resolve();
          });
        });
      });
    });
    describe('embedsMany - numeric ids + forceId', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          tmp = getTransientDataSource();
          Person = db.define('Person', {name: String});
          Address = tmp.define('Address', {
            id: {type: Number, id: true},
            street: String,
          });

          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsMany(Address, {options: {forceId: true}});
          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            p.addressList.create({street: 'Street 1'}, function(err, address) {
              if (err) return reject(err);
              assert.strictEqual(address.id, 1);
              p.addressList.create({street: 'Street 2'}, function(err, address) {
                assert.strictEqual(address.id, 2);
                p.addressList.create({id: 12345, street: 'Street 3'}, function(err, address) {
                  assert.strictEqual(address.id, 3);
                  resolve();
                });
              });
            });
          });
        });
      });
    });
    describe('embedsMany - explicit ids', function() {
      before(async function() {
        await new Promise((resolve, reject) => {
          tmp = getTransientDataSource();
          Person = db.define('Person', {name: String});
          Address = tmp.define('Address', {street: String}, {forceId: false});
          Address.validatesPresenceOf('street');

          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          Person.embedsMany(Address);
          db.automigrate(['Person'], err => err ? reject(err) : resolve());
        });
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            p.addressList.create({id: 'home', street: 'Street 1'}, function(err, address) {
              if (err) return reject(err);
              p.addressList.create({id: 'work', street: 'Work Street 2'}, function(err, address) {
                if (err) return reject(err);
                assert.strictEqual(address.id, 'work');
                assert.strictEqual(address.street, 'Work Street 2');
                resolve();
              });
            });
          });
        });
      });

      it('should find embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.findById('work', function(err, address) {
              assert.ok(address instanceof Address);
              assert.strictEqual(address.id, 'work');
              assert.strictEqual(address.street, 'Work Street 2');
              resolve();
            });
          });
        });
      });

      it('should check for duplicate ids', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.create({id: 'home', street: 'Invalid'}, function(err, addresses) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(err.details.codes.addresses, ['uniqueness']);
              resolve();
            });
          });
        });
      });

      it('should update embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            p.addressList.updateById('home', {street: 'New Street'}, function(err, address) {
              assert.ok(address instanceof Address);
              assert.strictEqual(address.id, 'home');
              assert.strictEqual(address.street, 'New Street');
              resolve();
            });
          });
        });
      });

      it('should remove embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 2);
            p.addressList.destroy('home', function(err) {
              if (err) return reject(err);
              assert.strictEqual(p.addresses.length, 1);
              resolve();
            });
          });
        });
      });

      it('should have embedded items - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne(function(err, p) {
            assert.strictEqual(p.addresses.length, 1);
            resolve();
          });
        });
      });

      it('should validate all embedded items', async function() {
        await new Promise((resolve, reject) => {
          const addresses = [];
          addresses.push({id: 'home', street: 'Home Street'});
          addresses.push({id: 'work', street: ''});
          Person.create({name: 'Wilma', addresses: addresses}, function(err, p) {
            assert.strictEqual(err.name, 'ValidationError');
            assert.deepStrictEqual(err.details.messages.addresses, [
              'contains invalid item: `work` (`street` can\'t be blank)',
            ]);
            resolve();
          });
        });
      });

      it('should build embedded items', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Wilma'}, function(err, p) {
            p.addressList.build({id: 'home', street: 'Home'});
            p.addressList.build({id: 'work', street: 'Work'});
            assert.strictEqual(p.addresses.length, 2);
            p.save(function(err, p) {
              resolve();
            });
          });
        });
      });

      it('should have embedded items - verify', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne({where: {name: 'Wilma'}}, function(err, p) {
            assert.strictEqual(p.name, 'Wilma');
            assert.strictEqual(p.addresses.length, 2);
            assert.strictEqual(p.addresses[0].id, 'home');
            assert.strictEqual(p.addresses[0].street, 'Home');
            assert.strictEqual(p.addresses[1].id, 'work');
            assert.strictEqual(p.addresses[1].street, 'Work');
            resolve();
          });
        });
      });

      it('should have accessors: at, get, set', async function() {
        await new Promise((resolve, reject) => {
          Person.findOne({where: {name: 'Wilma'}}, function(err, p) {
            assert.strictEqual(p.name, 'Wilma');
            assert.strictEqual(p.addresses.length, 2);
            assert.strictEqual(p.addressList.at(0).id, 'home');
            assert.strictEqual(p.addressList.get('home').id, 'home');
            assert.strictEqual(p.addressList.set('home', {id: 'den'}).id, 'den');
            assert.strictEqual(p.addressList.at(1).id, 'work');
            assert.strictEqual(p.addressList.get('work').id, 'work');
            assert.strictEqual(p.addressList.set('work', {id: 'factory'}).id, 'factory');
            resolve();
          });
        });
      });

      it('should create embedded from attributes - property name', async function() {
        await new Promise((resolve, reject) => {
          const addresses = [
            {id: 'home', street: 'Home Street'},
            {id: 'work', street: 'Work Street'},
          ];
          Person.create({name: 'Wilma', addresses: addresses}, function(err, p) {
            if (err) return reject(err);
            assert.strictEqual(p.addressList.at(0).id, 'home');
            assert.strictEqual(p.addressList.at(1).id, 'work');
            resolve();
          });
        });
      });

      it('should not create embedded from attributes - relation name', async function() {
        await new Promise((resolve, reject) => {
          const addresses = [
            {id: 'home', street: 'Home Street'},
            {id: 'work', street: 'Work Street'},
          ];
          Person.create({name: 'Wilma', addressList: addresses}, function(err, p) {
            if (err) return reject(err);
            assert.strictEqual(p.addresses.length, 0);
            resolve();
          });
        });
      });

      it('should create embedded items with auto-generated id', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Wilma'}, function(err, p) {
            p.addressList.create({street: 'Home Street 1'}, function(err, address) {
              if (err) return reject(err);
              assert.match(address.id, /^[0-9a-fA-F]{24}$/);
              assert.strictEqual(address.street, 'Home Street 1');
              resolve();
            });
          });
        });
      });
    });
    describe('embedsMany - persisted model', function() {
      let address0, address1, address2;
      let person;

      // This test spefically uses the Memory connector
      // in order to test the use of the auto-generated
      // id, in the sequence of the related model.

      before(async function() {
        await new Promise((resolve, reject) => {
          db = getMemoryDataSource();
          Person = db.define('Person', {name: String});
          Address = db.define('Address', {street: String});
          Address.validatesPresenceOf('street');

          db.automigrate(['Person', 'Address'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          // to save related model itself, set
          // persistent: true
          Person.embedsMany(Address, {
            scope: {order: 'street'},
            options: {persistent: true},
          });
          db.automigrate(['Person', 'Address'], err => err ? reject(err) : resolve());
        });
      });

      it('should create individual items (0)', async function() {
        await new Promise((resolve, reject) => {
          Address.create({street: 'Street 0'}, function(err, inst) {
            assert.strictEqual(inst.id, 1); // offset sequence
            address0 = inst;
            resolve();
          });
        });
      });

      it('should create individual items (1)', async function() {
        await new Promise((resolve, reject) => {
          Address.create({street: 'Street 1'}, function(err, inst) {
            assert.strictEqual(inst.id, 2);
            address1 = inst;
            resolve();
          });
        });
      });

      it('should create individual items (2)', async function() {
        await new Promise((resolve, reject) => {
          Address.create({street: 'Street 2'}, function(err, inst) {
            assert.strictEqual(inst.id, 3);
            address2 = inst;
            resolve();
          });
        });
      });

      it('should create individual items (3)', async function() {
        await new Promise((resolve, reject) => {
          Address.create({street: 'Street 3'}, function(err, inst) {
            assert.strictEqual(inst.id, 4); // offset sequence
            resolve();
          });
        });
      });

      it('should add embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Fred'}, function(err, p) {
            person = p;
            p.addressList.create(address1.toObject(), function(err, address) {
              if (err) return reject(err);
              assert.deepStrictEqual(address.id, 2);
              assert.strictEqual(address.street, 'Street 1');
              p.addressList.create(address2.toObject(), function(err, address) {
                if (err) return reject(err);
                assert.deepStrictEqual(address.id, 3);
                assert.strictEqual(address.street, 'Street 2');
                resolve();
              });
            });
          });
        });
      });

      it('should create embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(person.id, function(err, p) {
            p.addressList.create({street: 'Street 4'}, function(err, address) {
              if (err) return reject(err);
              assert.strictEqual(address.id, 5); // in Address sequence, correct offset
              assert.strictEqual(address.street, 'Street 4');
              resolve();
            });
          });
        });
      });

      it('should have embedded items on scope', async function() {
        await new Promise((resolve, reject) => {
          Person.findById(person.id, function(err, p) {
            p.addressList(function(err, addresses) {
              if (err) return reject(err);
              assert.strictEqual(addresses.length, 3);
              assert.strictEqual(addresses[0].street, 'Street 1');
              assert.strictEqual(addresses[1].street, 'Street 2');
              assert.strictEqual(addresses[2].street, 'Street 4');
              resolve();
            });
          });
        });
      });

      it('should validate embedded items on scope - id', async function() {
        await new Promise((resolve, reject) => {
          Person.create({name: 'Wilma'}, function(err, p) {
            p.addressList.create({id: null, street: 'Street 1'}, function(err, address) {
              if (err) return reject(err);
              assert.strictEqual(address.street, 'Street 1');
              resolve();
            });
          });
        });
      });

      it('should validate embedded items on scope - street', async function() {
        await new Promise((resolve, reject) => {
          const newId = uid.fromConnector(db) || 1234;
          Person.create({name: 'Wilma'}, function(err, p) {
            p.addressList.create({id: newId}, function(err, address) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(err.details.codes.street, ['presence']);
              let expected = 'The `Address` instance is not valid. ';
              expected += 'Details: `street` can\'t be blank (value: undefined).';
              assert.strictEqual(err.message, expected);
              resolve();
            });
          });
        });
      });
    });
    describe('embedsMany - relations, scope and properties', function() {
      let category, job1, job2, job3;

      before(function() {
        Category = db.define('Category', {name: String});
        Job = db.define('Job', {name: String});
        Link = db.define('Link', {name: String, notes: String}, {forceId: false});
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          Category.embedsMany(Link, {
            as: 'items', // rename
            scope: {include: 'job'}, // always include
            options: {belongsTo: 'job'}, // optional, for add()/remove()
          });
          Link.belongsTo(Job, {
            foreignKey: 'id', // re-use the actual job id
            properties: {id: 'id', name: 'name'}, // denormalize, transfer id
            options: {invertProperties: true},
          });
          db.automigrate(['Category', 'Job', 'Link'], function() {
            Job.create({name: 'Job 0'}, err => err ? reject(err) : resolve()); // offset ids for tests
          });
        });
      });

      it('should setup related items', async function() {
        await new Promise((resolve, reject) => {
          Job.create({name: 'Job 1'}, function(err, p) {
            if (err) return reject(err);
            job1 = p;
            Job.create({name: 'Job 2'}, function(err, p) {
              if (err) return reject(err);
              job2 = p;
              Job.create({name: 'Job 3'}, function(err, p) {
                if (err) return reject(err);
                job3 = p;
                resolve();
              });
            });
          });
        });
      });

      it('should associate items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.create({name: 'Category A'}, function(err, cat) {
            if (err) return reject(err);
            let link = cat.items.build();
            link.job(job1);
            link = cat.items.build();
            link.job(job2);
            cat.save(function(err, cat) {
              if (err) return reject(err);
              let job = cat.items.at(0);
              assert.ok(job instanceof Link);
              assert.ok(!Object.prototype.hasOwnProperty.call(job, 'jobId'));
              assert.deepStrictEqual(job.id, job1.id);
              assert.strictEqual(job.name, job1.name);
              job = cat.items.at(1);
              assert.deepStrictEqual(job.id, job2.id);
              assert.strictEqual(job.name, job2.name);
              resolve();
            });
          });
        });
      });

      it('should include related items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 2);

            // denormalized properties:
            assert.ok(cat.items.at(0) instanceof Link);
            assert.deepStrictEqual(cat.items.at(0).id, job1.id);
            assert.strictEqual(cat.items.at(0).name, job1.name);
            assert.deepStrictEqual(cat.items.at(1).id, job2.id);
            assert.strictEqual(cat.items.at(1).name, job2.name);

            // lazy-loaded relations
            assert.ok(cat.items.at(0).job() == null);
            assert.ok(cat.items.at(1).job() == null);

            cat.items(function(err, items) {
              if (err) return reject(err);
              assert.ok(cat.items.at(0).job() instanceof Job);
              assert.ok(cat.items.at(1).job() instanceof Job);
              assert.strictEqual(cat.items.at(1).job().name, 'Job 2');
              resolve();
            });
          });
        });
      });

      it('should remove embedded items by id', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 2);
            cat.items.destroy(job1.id, function(err) {
              if (err) return reject(err);
              if (err) return reject(err);
              assert.strictEqual(cat.links.length, 1);
              resolve();
            });
          });
        });
      });

      it('should find items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 1);
            assert.deepStrictEqual(cat.items.at(0).id, job2.id);
            assert.strictEqual(cat.items.at(0).name, job2.name);

            // lazy-loaded relations
            assert.ok(cat.items.at(0).job() == null);

            cat.items(function(err, items) {
              if (err) return reject(err);
              assert.ok(cat.items.at(0).job() instanceof Job);
              assert.strictEqual(cat.items.at(0).job().name, 'Job 2');
              resolve();
            });
          });
        });
      });

      it('should add related items to scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 1);
            cat.items.add(job3, function(err, link) {
              if (err) return reject(err);
              assert.ok(link instanceof Link);
              assert.deepStrictEqual(link.id, job3.id);
              assert.strictEqual(link.name, 'Job 3');

              assert.strictEqual(cat.links.length, 2);
              resolve();
            });
          });
        });
      });

      it('should find items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 2);

            assert.ok(cat.items.at(0) instanceof Link);
            assert.deepStrictEqual(cat.items.at(0).id, job2.id);
            assert.strictEqual(cat.items.at(0).name, job2.name);
            assert.deepStrictEqual(cat.items.at(1).id, job3.id);
            assert.strictEqual(cat.items.at(1).name, job3.name);

            resolve();
          });
        });
      });

      it('should remove embedded items by reference id', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 2);
            cat.items.remove(job2.id, function(err) {
              if (err) return reject(err);
              if (err) return reject(err);
              assert.strictEqual(cat.links.length, 1);
              resolve();
            });
          });
        });
      });

      it('should have removed embedded items by reference id', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.links.length, 1);
            resolve();
          });
        });
      });

      let jobId;

      it('should create items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.create({name: 'Category B'}, function(err, cat) {
            if (err) return reject(err);
            category = cat;
            const link = cat.items.build({notes: 'Some notes...'});
            link.job.create({name: 'Job 1'}, function(err, p) {
              if (err) return reject(err);
              jobId = p.id;
              assert.deepStrictEqual(cat.links[0].id, p.id);
              assert.strictEqual(cat.links[0].name, 'Job 1'); // denormalized
              assert.strictEqual(cat.links[0].notes, 'Some notes...');
              assert.strictEqual(cat.items.at(0), cat.links[0]);
              resolve();
            });
          });
        });
      });

      it('should find items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findById(category.id, function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.name, 'Category B');
            assert.deepStrictEqual(cat.links.toObject(), [
              {id: jobId, name: 'Job 1', notes: 'Some notes...'},
            ]);
            assert.strictEqual(cat.items.at(0), cat.links[0]);
            cat.items(function(err, items) { // alternative access
              if (err) return reject(err);
              assert.ok(Array.isArray(items));
              assert.strictEqual(items.length, 1);
              items[0].job(function(err, p) {
                assert.strictEqual(p.name, 'Job 1'); // actual value
                resolve();
              });
            });
          });
        });
      });

      it('should update items on scope - and save parent', async function() {
        await new Promise((resolve, reject) => {
          Category.findById(category.id, function(err, cat) {
            if (err) return reject(err);
            const link = cat.items.at(0);
            // use 'updateById' instead as a replacement as it is one of the embedsMany methods,
            // that works with all connectors. `updateAttributes` does not recognize the query performed on
            // the Category Model, resulting with an error in three connectors: mssql, oracle, postgresql
            cat.items.updateById(link.id, {notes: 'Updated notes...'}, function(err, link) {
              if (err) return reject(err);
              assert.strictEqual(link.notes, 'Updated notes...');
              resolve();
            });
          });
        });
      });

      it('should find items on scope - verify update', async function() {
        await new Promise((resolve, reject) => {
          Category.findById(category.id, function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.name, 'Category B');
            assert.deepStrictEqual(cat.links.toObject(), [
              {id: jobId, name: 'Job 1', notes: 'Updated notes...'},
            ]);
            resolve();
          });
        });
      });

      it('should remove items from scope - and save parent', async function() {
        await new Promise((resolve, reject) => {
          Category.findById(category.id, function(err, cat) {
            if (err) return reject(err);
            cat.items.at(0).destroy(function(err, link) {
              if (err) return reject(err);
              assert.strictEqual(cat.links.length, 0);
              resolve();
            });
          });
        });
      });

      it('should find items on scope - verify destroy', async function() {
        await new Promise((resolve, reject) => {
          Category.findById(category.id, function(err, cat) {
            if (err) return reject(err);
            assert.strictEqual(cat.name, 'Category B');
            assert.strictEqual(cat.links.length, 0);
            resolve();
          });
        });
      });
    });
    describe('embedsMany - polymorphic relations', function() {
      let person1, person2;

      before(async function() {
        await new Promise((resolve, reject) => {
          tmp = getTransientDataSource();

          Book = db.define('Book', {name: String});
          Author = db.define('Author', {name: String});
          Reader = db.define('Reader', {name: String});

          Link = tmp.define('Link', {
            id: {type: Number, id: true},
            name: String, notes: String,
          }); // generic model
          Link.validatesPresenceOf('linkedId');
          Link.validatesPresenceOf('linkedType');

          db.automigrate(['Book', 'Author', 'Reader'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          const idType = db.connector.getDefaultIdType();

          Book.embedsMany(Link, {as: 'people',
            polymorphic: 'linked',
            scope: {include: 'linked'},
          });
          Link.belongsTo('linked', {
            polymorphic: {idType: idType}, // native type
            properties: {name: 'name'}, // denormalized
            options: {invertProperties: true},
          });
          db.automigrate(['Book', 'Author', 'Reader'], err => err ? reject(err) : resolve());
        });
      });

      it('should setup related items', async function() {
        await new Promise((resolve, reject) => {
          Author.create({name: 'Author 1'}, function(err, p) {
            person1 = p;
            Reader.create({name: 'Reader 1'}, function(err, p) {
              person2 = p;
              resolve();
            });
          });
        });
      });

      it('should create items on scope', async function() {
        await new Promise((resolve, reject) => {
          Book.create({name: 'Book'}, function(err, book) {
            let link = book.people.build({notes: 'Something ...'});
            link.linked(person1);
            link = book.people.build();
            link.linked(person2);
            book.save(function(err, book) {
              if (err) return reject(err);

              let link = book.people.at(0);
              assert.ok(link instanceof Link);
              assert.strictEqual(link.id, 1);
              assert.deepStrictEqual(link.linkedId, person1.id);
              assert.strictEqual(link.linkedType, 'Author');
              assert.strictEqual(link.name, 'Author 1');

              link = book.people.at(1);
              assert.ok(link instanceof Link);
              assert.strictEqual(link.id, 2);
              assert.deepStrictEqual(link.linkedId, person2.id);
              assert.strictEqual(link.linkedType, 'Reader');
              assert.strictEqual(link.name, 'Reader 1');

              resolve();
            });
          });
        });
      });

      it('should include related items on scope', async function() {
        await new Promise((resolve, reject) => {
          Book.findOne(function(err, book) {
            assert.strictEqual(book.links.length, 2);

            let link = book.people.at(0);
            assert.ok(link instanceof Link);
            assert.deepStrictEqual(link.id, 1);
            assert.deepStrictEqual(link.linkedId, person1.id);
            assert.strictEqual(link.linkedType, 'Author');
            assert.strictEqual(link.notes, 'Something ...');

            link = book.people.at(1);
            assert.ok(link instanceof Link);
            assert.deepStrictEqual(link.id, 2);
            assert.deepStrictEqual(link.linkedId, person2.id);
            assert.strictEqual(link.linkedType, 'Reader');

            // lazy-loaded relations
            assert.ok(book.people.at(0).linked() == null);
            assert.ok(book.people.at(1).linked() == null);

            book.people(function(err, people) {
              assert.ok(people[0].linked() instanceof Author);
              assert.strictEqual(people[0].linked().name, 'Author 1');
              assert.ok(people[1].linked() instanceof Reader);
              assert.strictEqual(people[1].linked().name, 'Reader 1');
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.supportInclude === true,
        'should include nested related items on scope', async function() {
          await new Promise((resolve, reject) => {
            // There's some date duplication going on, so it might
            // make sense to override toObject on a case-by-case basis
            // to sort this out (delete links, keep people).
            // In loopback, an afterRemote filter could do this as well.

            Book.find({include: 'people'}, function(err, books) {
              const obj = books[0].toObject();

              assert.ok(Object.prototype.hasOwnProperty.call(obj, 'links'));
              assert.ok(Object.prototype.hasOwnProperty.call(obj, 'people'));

              assert.strictEqual(obj.links.length, 2);
              assert.ok(('Author 1', 'Reader 1').includes(obj.links[0].name));
              assert.ok(('Author 1', 'Reader 1').includes(obj.links[1].name));

              assert.strictEqual(obj.people.length, 2);

              assert.strictEqual(obj.people[0].name, 'Author 1');
              assert.strictEqual(obj.people[0].notes, 'Something ...');

              assert.strictEqual(obj.people[0].linked.name, 'Author 1');
              assert.strictEqual(obj.people[1].linked.name, 'Reader 1');

              resolve();
            });
          });
        });
    });
    describe('referencesMany', function() {
      let job1, job2, job3;

      before(async function() {
        await new Promise((resolve, reject) => {
          Category = db.define('Category', {name: String});
          Job = db.define('Job', {name: String});

          db.automigrate(['Job', 'Category'], err => err ? reject(err) : resolve());
        });
      });

      it('can be declared', async function() {
        await new Promise((resolve, reject) => {
          const reverse = function(cb) {
            cb = cb || createPromiseCallback();
            const modelInstance = this.modelInstance;
            const fk = this.definition.keyFrom;
            const ids = modelInstance[fk] || [];
            modelInstance.updateAttribute(fk, ids.reverse(), function(err, inst) {
              cb(err, inst[fk] || []);
            });
            return cb.promise;
          };

          reverse.shared = true; // remoting
          reverse.http = {verb: 'put', path: '/jobs/reverse'};

          Category.referencesMany(Job, {scopeMethods: {
            reverse: reverse,
          }});

          assert.strictEqual(typeof Category.prototype['__reverse__jobs'], 'function');
          assert.ok(Category.prototype['__reverse__jobs'].shared != null);
          assert.deepStrictEqual(Category.prototype['__reverse__jobs'].http, reverse.http);

          db.automigrate(['Job', 'Category'], err => err ? reject(err) : resolve());
        });
      });

      it('should setup test records', async function() {
        await new Promise((resolve, reject) => {
          Job.create({name: 'Job 1'}, function(err, p) {
            job1 = p;
            Job.create({name: 'Job 3'}, function(err, p) {
              job3 = p;
              resolve();
            });
          });
        });
      });

      it('should create record on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.create({name: 'Category A'}, function(err, cat) {
            assert.ok(Array.isArray(cat.jobIds));
            assert.strictEqual(cat.jobIds.length, 0);
            cat.jobs.create({name: 'Job 2'}, function(err, p) {
              if (err) return reject(err);
              assert.strictEqual(cat.jobIds.length, 1);
              assert.deepStrictEqual(cat.jobIds[0], p.id);
              assert.strictEqual(p.name, 'Job 2');
              job2 = p;
              resolve();
            });
          });
        });
      });

      it('should not allow duplicate record on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobIds = [job2.id, job2.id];
            cat.save(function(err, p) {
              assert.ok(err != null);
              assert.strictEqual(err.name, 'ValidationError');
              assert.deepStrictEqual(err.details.codes.jobs, ['uniqueness']);
              resolve();
            });
          });
        });
      });

      it('should find items on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            assert.strictEqual(cat.jobIds.length, 1);
            assert.deepStrictEqual(cat.jobIds[0], job2.id);
            cat.jobs(function(err, jobs) {
              if (err) return reject(err);
              const p = jobs[0];
              assert.deepStrictEqual(p.id, job2.id);
              assert.strictEqual(p.name, 'Job 2');
              resolve();
            });
          });
        });
      });

      it('should find items on scope - findById', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            assert.strictEqual(cat.jobIds.length, 1);
            assert.deepStrictEqual(cat.jobIds[0], job2.id);
            cat.jobs.findById(job2.id, function(err, p) {
              if (err) return reject(err);
              assert.ok(p instanceof Job);
              assert.deepStrictEqual(p.id, job2.id);
              assert.strictEqual(p.name, 'Job 2');
              resolve();
            });
          });
        });
      });

      it('should check if a record exists on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.exists(job2.id, function(err, exists) {
              if (err) return reject(err);
              assert.ok(exists != null);
              resolve();
            });
          });
        });
      });

      it('should update a record on scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            const attrs = {name: 'Job 2 - edit'};
            cat.jobs.updateById(job2.id, attrs, function(err, p) {
              if (err) return reject(err);
              assert.strictEqual(p.name, attrs.name);
              resolve();
            });
          });
        });
      });

      it('should get a record by index - at', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.at(0, function(err, p) {
              if (err) return reject(err);
              assert.ok(p instanceof Job);
              assert.deepStrictEqual(p.id, job2.id);
              assert.strictEqual(p.name, 'Job 2 - edit');
              resolve();
            });
          });
        });
      });

      it('should add a record to scope - object', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.add(job1, function(err, prod) {
              if (err) return reject(err);
              assert.deepStrictEqual(cat.jobIds[0], job2.id);
              assert.deepStrictEqual(cat.jobIds[1], job1.id);
              assert.deepStrictEqual(prod.id, job1.id);
              assert.strictEqual(prod.name, 'Job 1');
              resolve();
            });
          });
        });
      });

      it('should add a record to scope - object', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.add(job3.id, function(err, prod) {
              if (err) return reject(err);
              const expected = [job2.id, job1.id, job3.id];
              assert.deepStrictEqual(cat.jobIds[0], expected[0]);
              assert.deepStrictEqual(cat.jobIds[1], expected[1]);
              assert.deepStrictEqual(cat.jobIds[2], expected[2]);
              assert.deepStrictEqual(prod.id, job3.id);
              assert.strictEqual(prod.name, 'Job 3');
              resolve();
            });
          });
        });
      });

      it('should find items on scope - findById', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.findById(job3.id, function(err, p) {
              if (err) return reject(err);
              assert.deepStrictEqual(p.id, job3.id);
              assert.strictEqual(p.name, 'Job 3');
              resolve();
            });
          });
        });
      });

      it('should find items on scope - filter', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            const filter = {where: {name: 'Job 1'}};
            cat.jobs(filter, function(err, jobs) {
              if (err) return reject(err);
              assert.strictEqual(jobs.length, 1);
              const p = jobs[0];
              assert.deepStrictEqual(p.id, job1.id);
              assert.strictEqual(p.name, 'Job 1');
              resolve();
            });
          });
        });
      });

      it('should remove items from scope', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.remove(job1.id, function(err, ids) {
              if (err) return reject(err);
              const expected = [job2.id, job3.id];
              assert.deepStrictEqual(cat.jobIds[0], expected[0]);
              assert.deepStrictEqual(cat.jobIds[1], expected[1]);
              assert.deepStrictEqual(cat.jobIds[0], ids[0]);
              assert.deepStrictEqual(cat.jobIds[1], ids[1]);
              resolve();
            });
          });
        });
      });

      it('should find items on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            const expected = [job2.id, job3.id];
            assert.deepStrictEqual(cat.jobIds[0], expected[0]);
            assert.deepStrictEqual(cat.jobIds[1], expected[1]);
            cat.jobs(function(err, jobs) {
              if (err) return reject(err);
              assert.strictEqual(jobs.length, 2);
              assert.deepStrictEqual(jobs[0].id, job2.id);
              assert.deepStrictEqual(jobs[1].id, job3.id);
              resolve();
            });
          });
        });
      });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should find items on scope and ordered them by name DESC', async function() {
          await new Promise((resolve, reject) => {
            Category.find(function(err, categories) {
              assert.strictEqual(categories.length, 1);
              categories[0].jobs({order: 'name DESC'}, function(err, jobs) {
                if (err) return reject(err);
                assert.strictEqual(jobs.length, 2);
                assert.deepStrictEqual(jobs[0].id, job3.id);
                assert.deepStrictEqual(jobs[1].id, job2.id);
                resolve();
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should allow custom scope methods - reverse', async function() {
          await new Promise((resolve, reject) => {
            Category.findOne(function(err, cat) {
              cat.jobs.reverse(function(err, ids) {
                const expected = [job3.id, job2.id];
                assert.deepStrictEqual(ids.toArray(), expected);
                assert.deepStrictEqual(cat.jobIds.toArray(), expected);
                resolve();
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort === false,
        'should allow custom scope methods - reverse', async function() {
          await new Promise((resolve, reject) => {
            Category.findOne(function(err, cat) {
              cat.jobs.reverse(function(err, ids) {
                const expected = [job3.id, job2.id];
                assert.ok((expected).includes(ids[0]));
                assert.ok((expected).includes(ids[1]));
                assert.ok((expected).includes(cat.jobIds[0]));
                assert.ok((expected).includes(cat.jobIds[1]));
                resolve();
              });
            });
          });
        });

      bdd.itIf(connectorCapabilities.supportInclude === true,
        'should include related items from scope', async function() {
          await new Promise((resolve, reject) => {
            Category.find({include: 'jobs'}, function(err, categories) {
              assert.strictEqual(categories.length, 1);
              const cat = categories[0].toObject();
              assert.strictEqual(cat.name, 'Category A');
              assert.strictEqual(cat.jobs.length, 2);
              assert.deepStrictEqual(cat.jobs[0].id, job3.id);
              assert.deepStrictEqual(cat.jobs[1].id, job2.id);
              resolve();
            });
          });
        });

      it('should destroy items from scope - destroyById', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            cat.jobs.destroy(job2.id, function(err) {
              if (err) return reject(err);
              assert.strictEqual(cat.jobIds.length, 1);
              assert.deepStrictEqual(cat.jobIds[0], job3.id);
              Job.exists(job2.id, function(err, exists) {
                if (err) return reject(err);
                assert.ok(exists != null);
                assert.strictEqual(exists, false);
                resolve();
              });
            });
          });
        });
      });

      it('should find items on scope - verify', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne(function(err, cat) {
            assert.strictEqual(cat.jobIds.length, 1);
            assert.deepStrictEqual(cat.jobIds[0], job3.id);
            cat.jobs(function(err, jobs) {
              if (err) return reject(err);
              assert.strictEqual(jobs.length, 1);
              assert.deepStrictEqual(jobs[0].id, job3.id);
              resolve();
            });
          });
        });
      });

      it('should setup test records with promises', async function() {
        await new Promise((resolve, reject) => {
          db.automigrate(['Job', 'Category'], function() {
            return Job.create({name: 'Job 1'})
              .then(function(p) {
                job1 = p;
                return Job.create({name: 'Job 3'});
              })
              .then(function(p) {
                job3 = p;
                resolve();
              }).catch(reject);
          });
        });
      });

      it('should create record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.create({name: 'Category A'})
            .then(function(cat) {
              assert.ok(Array.isArray(cat.jobIds));
              assert.strictEqual(cat.jobIds.length, 0);
              return cat.jobs.create({name: 'Job 2'})
                .then(function(p) {
                  assert.strictEqual(cat.jobIds.length, 1);
                  assert.deepStrictEqual(cat.jobIds[0], p.id);
                  assert.strictEqual(p.name, 'Job 2');
                  job2 = p;
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should not allow duplicate record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              cat.jobIds = [job2.id, job2.id];
              return cat.save();
            })
            .then(
              function(p) { reject(new Error('save() should have failed')); },
              function(err) {
                assert.strictEqual(err.name, 'ValidationError');
                assert.deepStrictEqual(err.details.codes.jobs, ['uniqueness']);
                resolve();
              },
            );
        });
      });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should find items on scope with promises', async function() {
          await new Promise((resolve, reject) => {
            Category.findOne()
              .then(function(cat) {
                assert.deepStrictEqual(cat.jobIds.toArray(), [job2.id]);
                return cat.jobs.find();
              })
              .then(function(jobs) {
                const p = jobs[0];
                assert.deepStrictEqual(p.id, job2.id);
                assert.strictEqual(p.name, 'Job 2');
                resolve();
              })
              .catch(reject);
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort === false,
        'should find items on scope with promises', async function() {
          await new Promise((resolve, reject) => {
            const theExpectedIds = [job1.id, job2.id, job3.id];
            const theExpectedNames = ['Job 1', 'Job 2', 'Job 3'];
            Category.findOne()
              .then(function(cat) {
                assert.ok((theExpectedIds).includes(cat.jobIds[0]));
                return cat.jobs.find();
              })
              .then(function(jobs) {
                const p = jobs[0];
                assert.ok((theExpectedIds).includes(p.id));
                assert.ok((theExpectedNames).includes(p.name));
                resolve();
              })
              .catch(reject);
          });
        });

      it('should find items on scope with promises - findById', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              assert.strictEqual(cat.jobIds.length, 1);
              assert.deepStrictEqual(cat.jobIds[0], job2.id);
              return cat.jobs.findById(job2.id);
            })
            .then(function(p) {
              assert.ok(p instanceof Job);
              assert.deepStrictEqual(p.id, job2.id);
              assert.strictEqual(p.name, 'Job 2');
              resolve();
            })
            .catch(reject);
        });
      });

      it('should check if a record exists on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.exists(job2.id)
                .then(function(exists) {
                  assert.ok(exists != null);
                  resolve();
                });
            }).catch(reject);
        });
      });

      it('should update a record on scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              const attrs = {name: 'Job 2 - edit'};
              return cat.jobs.updateById(job2.id, attrs)
                .then(function(p) {
                  assert.strictEqual(p.name, attrs.name);
                  resolve();
                });
            })
            .catch(reject);
        });
      });

      it('should get a record by index with promises - at', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.at(0);
            })
            .then(function(p) {
              assert.ok(p instanceof Job);
              assert.deepStrictEqual(p.id, job2.id);
              assert.strictEqual(p.name, 'Job 2 - edit');
              resolve();
            })
            .catch(reject);
        });
      });

      it('should add a record to scope with promises - object', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.add(job1)
                .then(function(prod) {
                  const expected = [job2.id, job1.id];
                  assert.strictEqual(cat.jobIds.length, expected.length);
                  assert.ok((expected).every(item => cat.jobIds.includes(item)));
                  assert.deepStrictEqual(prod.id, job1.id);
                  assert.strictEqual(prod.name, 'Job 1');
                  resolve();
                });
            })
            .catch(reject);
        });
      });

      it('should add a record to scope with promises - object', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.add(job3.id)
                .then(function(prod) {
                  const expected = [job2.id, job1.id, job3.id];
                  assert.strictEqual(cat.jobIds.length, expected.length);
                  assert.ok((expected).every(item => cat.jobIds.includes(item)));
                  assert.deepStrictEqual(prod.id, job3.id);
                  assert.strictEqual(prod.name, 'Job 3');
                  resolve();
                });
            })
            .catch(reject);
        });
      });

      it('should find items on scope with promises - findById', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.findById(job3.id);
            })
            .then(function(p) {
              assert.deepStrictEqual(p.id, job3.id);
              assert.strictEqual(p.name, 'Job 3');
              resolve();
            })
            .catch(reject);
        });
      });

      it('should find items on scope with promises - filter', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              const filter = {where: {name: 'Job 1'}};
              return cat.jobs.find(filter);
            })
            .then(function(jobs) {
              assert.strictEqual(jobs.length, 1);
              const p = jobs[0];
              assert.deepStrictEqual(p.id, job1.id);
              assert.strictEqual(p.name, 'Job 1');
              resolve();
            })
            .catch(reject);
        });
      });

      it('should remove items from scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.remove(job1.id)
                .then(function(ids) {
                  const expected = [job2.id, job3.id];
                  assert.strictEqual(cat.jobIds.length, expected.length);
                  assert.ok((expected).every(item => cat.jobIds.includes(item)));
                  assert.deepStrictEqual(cat.jobIds, ids);
                  resolve();
                });
            })
            .catch(reject);
        });
      });

      it('should find items on scope with promises - verify', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              const expected = [job2.id, job3.id];
              assert.strictEqual(cat.jobIds.length, expected.length);
              assert.ok((expected).every(item => cat.jobIds.includes(item)));
              return cat.jobs.find();
            })
            .then(function(jobs) {
              assert.strictEqual(jobs.length, 2);
              assert.deepStrictEqual(jobs[0].id, job2.id);
              assert.deepStrictEqual(jobs[1].id, job3.id);
              resolve();
            })
            .catch(reject);
        });
      });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should find items on scope and ordered them by name DESC', async function() {
          await new Promise((resolve, reject) => {
            Category.find()
              .then(function(categories) {
                assert.strictEqual(categories.length, 1);
                return categories[0].jobs.find({order: 'name DESC'});
              })
              .then(function(jobs) {
                assert.strictEqual(jobs.length, 2);
                assert.deepStrictEqual(jobs[0].id, job3.id);
                assert.deepStrictEqual(jobs[1].id, job2.id);
                resolve();
              })
              .catch(reject);
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort !== false,
        'should allow custom scope methods with promises - reverse', async function() {
          await new Promise((resolve, reject) => {
            Category.findOne()
              .then(function(cat) {
                return cat.jobs.reverse()
                  .then(function(ids) {
                    const expected = [job3.id, job2.id];
                    assert.deepStrictEqual(ids.toArray(), expected);
                    assert.deepStrictEqual(cat.jobIds.toArray(), expected);
                    resolve();
                  });
              })
              .catch(reject);
          });
        });

      bdd.itIf(connectorCapabilities.adhocSort === true &&
    connectorCapabilities.supportInclude === true,
      'should include related items from scope with promises', async function() {
        await new Promise((resolve, reject) => {
          Category.find({include: 'jobs'})
            .then(function(categories) {
              assert.strictEqual(categories.length, 1);
              const cat = categories[0].toObject();
              assert.strictEqual(cat.name, 'Category A');
              assert.strictEqual(cat.jobs.length, 2);
              assert.deepStrictEqual(cat.jobs[0].id, job3.id);
              assert.deepStrictEqual(cat.jobs[1].id, job2.id);
              resolve();
            }).catch(reject);
        });
      });

      it('should destroy items from scope with promises - destroyById', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              return cat.jobs.destroy(job2.id)
                .then(function() {
                  const expected = [job3.id];
                  if (connectorCapabilities.adhocSort !== false) {
                    assert.deepStrictEqual(cat.jobIds.toArray(), expected);
                  } else {
                    assert.ok((expected).every(item => cat.jobIds.toArray().includes(item)));
                  }
                  return Job.exists(job2.id);
                })
                .then(function(exists) {
                  assert.ok(exists != null);
                  assert.strictEqual(exists, false);
                  resolve();
                });
            })
            .catch(reject);
        });
      });

      it('should find items on scope with promises - verify', async function() {
        await new Promise((resolve, reject) => {
          Category.findOne()
            .then(function(cat) {
              const expected = [job3.id];
              assert.strictEqual(cat.jobIds.length, expected.length);
              assert.ok((expected).every(item => cat.jobIds.includes(item)));
              return cat.jobs.find();
            })
            .then(function(jobs) {
              assert.strictEqual(jobs.length, 1);
              assert.deepStrictEqual(jobs[0].id, job3.id);
              resolve();
            })
            .catch(reject);
        });
      });

      describe('custom relation/scope methods', function() {
        let categoryId;

        before(async function() {
          await new Promise((resolve, reject) => {
            Category = db.define('Category', {name: String});
            Job = db.define('Job', {name: String});

            db.automigrate(['Job', 'Category'], err => err ? reject(err) : resolve());
          });
        });

        it('can be declared', async function() {
          await new Promise((resolve, reject) => {
            const relation = Category.hasMany(Job);

            const summarize = function(cb) {
              cb = cb || createPromiseCallback();
              const modelInstance = this.modelInstance;
              this.fetch(function(err, items) {
                if (err) return cb(err, []);
                const summary = items.map(function(item) {
                  const obj = item.toObject();
                  obj.categoryName = modelInstance.name;
                  return obj;
                });
                cb(null, summary);
              });
              return cb.promise;
            };

            summarize.shared = true; // remoting
            summarize.http = {verb: 'get', path: '/jobs/summary'};

            relation.defineMethod('summarize', summarize);

            assert.strictEqual(typeof Category.prototype['__summarize__jobs'], 'function');
            assert.ok(Category.prototype['__summarize__jobs'].shared != null);
            assert.deepStrictEqual(Category.prototype['__summarize__jobs'].http, summarize.http);

            db.automigrate(['Job', 'Category'], err => err ? reject(err) : resolve());
          });
        });

        it('should setup test records', async function() {
          await new Promise((resolve, reject) => {
            Category.create({name: 'Category A'}, function(err, cat) {
              categoryId = cat.id;
              cat.jobs.create({name: 'Job 1'}, function(err, p) {
                cat.jobs.create({name: 'Job 2'}, function(err, p) {
                  resolve();
                });
              });
            });
          });
        });

        it('should allow custom scope methods - summarize', async function() {
          await new Promise((resolve, reject) => {
            const categoryIdStr = categoryId.toString();
            const expected = [
              {name: 'Job 1', categoryId: categoryIdStr, categoryName: 'Category A'},
              {name: 'Job 2', categoryId: categoryIdStr, categoryName: 'Category A'},
            ];

            Category.findOne(function(err, cat) {
              cat.jobs.summarize(function(err, summary) {
                if (err) return reject(err);
                const result = summary.map(function(item) {
                  delete item.id;
                  item.categoryId = item.categoryId.toString();
                  return item;
                }).sort((a, b) => a.name.localeCompare(b.name));
                assert.deepStrictEqual(result, expected);
                resolve();
              });
            });
          });
        });

        it('should allow custom scope methods with promises - summarize', async function() {
          await new Promise((resolve, reject) => {
            const categoryIdStr = categoryId.toString();
            const expected = [
              {name: 'Job 1', categoryId: categoryIdStr, categoryName: 'Category A'},
              {name: 'Job 2', categoryId: categoryIdStr, categoryName: 'Category A'},
            ];

            Category.findOne()
              .then(function(cat) {
                return cat.jobs.summarize();
              })
              .then(function(summary) {
                const result = summary.map(function(item) {
                  delete item.id;
                  item.categoryId = item.categoryId.toString();
                  return item;
                }).sort((a, b) => a.name.localeCompare(b.name));
                assert.deepStrictEqual(result, expected);
                resolve();
              })
              .catch(reject);
          });
        });
      });
      describe('relation names', function() {
        it('throws error when a relation name is `trigger`', function() {
          Chapter = db.define('Chapter', {name: String});

          assert.throws(function() {
            db.define(
              'Book',
              {name: String},
              {
                relations: {
                  trigger: {
                    model: 'Chapter',
                    type: 'hasMany',
                  },
                },
              },
            );
          }, /Invalid relation name: trigger/);
        });
      });

      describe('polymorphic hasMany - revert', function() {
        before(async function() {
          await new Promise((resolve, reject) => {
            Picture = db.define('Picture', {name: String});
            Author = db.define('Author', {name: String});
            PictureLink = db.define('PictureLink', {});
            Author.hasMany(Picture, {through: PictureLink, polymorphic: 'imageable', invert: true});
            Picture.hasMany(Author, {through: PictureLink, polymorphic: 'imageable'});
            db.automigrate(['Picture', 'Author', 'PictureLink'], err => err ? reject(err) : resolve());
          });
        });
        it('should properly query through an inverted relationship', async function() {
          await new Promise((resolve, reject) => {
            Author.create({name: 'Steve'}, function(err, author) {
              if (err) {
                return reject(err);
              }
              author.pictures.create({name: 'Steve pic 1'}, function(err, pic) {
                if (err) {
                  return reject(err);
                }
                Author.findOne({include: 'pictures'}, function(err, author) {
                  if (err) {
                    return reject(err);
                  }
                  assert.deepStrictEqual(author.pictures().length, 1);
                  assert.deepStrictEqual(author.pictures()[0].name, 'Steve pic 1');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
});
