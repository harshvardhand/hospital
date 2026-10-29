const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPatientStore } = require("../backend/patient-store");

test("patient PINs are hashed, visit records persist, and a staff reset rotates the PIN", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kalpana-patients-test-"));
  const dataFile = path.join(directory, "patients.json");
  const store = createPatientStore(dataFile);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await store.initialize();

  const record = {
    appointmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    patient: "Patient One",
    phone: "+91 9876543210",
    date: "2024-08-01",
    doctor: "Dr. Nikhil H. Mahanubhav",
    treatment: "Root Canal (RCT)",
    notes: "Completed treatment",
    followUp: "Review in one week"
  };
  const first = await store.addVisit(record);
  assert.match(first.issuedPin, /^\d{8}$/);
  assert.equal((await store.verifyPin(record.patient, first.issuedPin)).visits.length, 1);
  assert.equal(await store.verifyPin(record.patient, "00000000"), null);
  assert.equal(await store.verifyPin("Unknown Patient", first.issuedPin), null);

  const sibling = await store.addVisit({
    ...record,
    appointmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    patient: "Patient Two",
    treatment: "Cavity Tooth Fillings"
  });
  assert.notEqual(sibling.issuedPin, first.issuedPin);
  assert.equal((await store.verifyPin(record.patient, first.issuedPin)).patient, "Patient One");
  assert.equal((await store.verifyPin(record.patient, first.issuedPin)).visits.length, 1);
  assert.equal((await store.verifyPin("Patient Two", sibling.issuedPin)).patient, "Patient Two");
  assert.equal((await store.searchByName("patient")).length, 2);
  assert.equal((await store.searchByName("ONE"))[0].patient, "Patient One");
  await assert.rejects(
    store.addVisit(record),
    error => error.statusCode === 409 && /already exists/.test(error.message)
  );

  const persisted = JSON.parse(await fs.readFile(dataFile, "utf8"));
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0].pinHash.includes(first.issuedPin), false);
  assert.equal(persisted[0].visits[0].treatment, record.treatment);

  const second = await store.addVisit({
    ...record,
    appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    resetPin: true
  });
  assert.match(second.issuedPin, /^\d{8}$/);
  assert.notEqual(second.issuedPin, first.issuedPin);
  assert.equal(await store.verifyPin(record.patient, first.issuedPin), null);
  assert.equal((await store.verifyPin(record.patient, second.issuedPin)).visits.length, 2);
});
