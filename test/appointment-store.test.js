const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAppointmentStore } = require("../backend/appointment-store");

test("appointments validate, persist, reject slot conflicts, and update status", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kalpana-store-"));
  const dataFile = path.join(directory, "appointments.json");
  const store = createAppointmentStore(dataFile);
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.initialize();
  const input = {
    patient: "Test Patient",
    phone: "+91 9876543210",
    doctor: "Dr. Nikhil H. Mahanubhav",
    treatment: "Root Canal (RCT)",
    slot: "10:30 AM",
    date: "2030-08-01",
    reason: ""
  };
  const created = await store.add(input);
  assert.equal(created.token, "Token #01");
  assert.equal((await store.list()).length, 1);
  await assert.rejects(
    store.add({ ...input, date: "2030-08-07" }),
    error => error.statusCode === 400 && /closed on Wednesdays/.test(error.message)
  );
  const sundayAppointment = await store.add({ ...input, date: "2030-08-04" });
  assert.equal(sundayAppointment.date, "2030-08-04");

  await assert.rejects(
    store.add({ ...input, patient: "Conflicting Patient" }),
    error => error.statusCode === 409
  );
  await assert.rejects(
    store.add({ ...input, doctor: "Unknown" }),
    error => error.statusCode === 400
  );
  await assert.rejects(
    store.add({ ...input, slot: "10:15 AM" }),
    error => error.statusCode === 400
  );
  const firstSlot = await store.add({ ...input, slot: "10:00 AM" });
  assert.equal(firstSlot.slot, "10:00 AM");
  const lastHalfHourSlot = await store.add({ ...input, slot: "08:00 PM" });
  assert.equal(lastHalfHourSlot.slot, "08:00 PM");
  const finalSlot = await store.add({ ...input, slot: "08:15 PM" });
  assert.equal(finalSlot.slot, "08:15 PM");

  const updated = await store.updateStatus(created.id, "Completed");
  assert.equal(updated.status, "Completed");
  const reopenedStore = createAppointmentStore(dataFile);
  assert.equal((await reopenedStore.list())[0].status, "Completed");
});
