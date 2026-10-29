// One-time copy of local data/*.json into Supabase.
// Usage: set SUPABASE_URL and SUPABASE_SERVICE_KEY, then run: npm run migrate
// Safe to re-run: rows are matched by id and overwritten, not duplicated.
require("dotenv").config();
const fs = require("node:fs/promises");
const path = require("node:path");
const { getSupabase } = require("../backend/supabase-client");

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(path.join(__dirname, "..", "data", file), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const supabase = getSupabase();
  const appointments = (await readJson("appointments.json")).map(a => ({
    id: a.id, token: a.token, patient: a.patient, phone: a.phone || "",
    doctor: a.doctor, treatment: a.treatment, slot: a.slot, date: a.date,
    reason: a.reason || "", emergency: a.emergency === true,
    status: a.status || "Waiting", created_at: a.createdAt
  }));
  const patients = (await readJson("patients.json")).map(p => ({
    id: p.id, name: p.name, phone: p.phone,
    pin_salt: p.pinSalt, pin_hash: p.pinHash,
    created_at: p.createdAt, visits: p.visits || []
  }));
  if (patients.length) {
    const { error } = await supabase.from("patients").upsert(patients);
    if (error) throw new Error(`Patients: ${error.message}`);
  }
  if (appointments.length) {
    const { error } = await supabase.from("appointments").upsert(appointments);
    if (error) throw new Error(`Appointments: ${error.message}`);
  }
  console.log(`Copied ${patients.length} patient(s) and ${appointments.length} appointment(s) to Supabase.`);
}

main().catch(error => { console.error("Migration failed:", error.message); process.exitCode = 1; });
