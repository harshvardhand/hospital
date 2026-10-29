const {
  randomBytes,
  randomInt,
  randomUUID,
  scrypt: scryptCallback,
  timingSafeEqual
} = require("node:crypto");
const { promisify } = require("node:util");
const { getSupabase } = require("./supabase-client");

const scrypt = promisify(scryptCallback);
const pinLength = 64;
const allowedDoctors = new Set([
  "Dr. Nikhil H. Mahanubhav",
  "Dr. Shubhangi N. Mahanubhav",
  "Dr. Nikhil & Dr. Shubhangi"
]);

function normalizePhone(phone) {
  return typeof phone === "string" ? phone.replace(/\D/g, "") : "";
}

function normalizeName(name) {
  return typeof name === "string" ? name.normalize("NFKC").trim().toLocaleLowerCase("en") : "";
}

function validDate(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

function validateVisit(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Visit details are required.";
  }
  if (typeof input.patient !== "string" || !input.patient.trim() || input.patient.trim().length > 100) {
    return "Enter a patient name (up to 100 characters).";
  }
  if (typeof input.phone !== "string" || input.phone.length > 25
    || !/^[+\d\s()-]{7,25}$/.test(input.phone)
    || normalizePhone(input.phone).length < 7
    || normalizePhone(input.phone).length > 15) {
    return "Enter a valid patient phone number.";
  }
  if (!validDate(input.date)) return "Select a valid visit date that is not in the future.";
  if (!allowedDoctors.has(input.doctor)) return "Select a valid clinician.";
  if (typeof input.treatment !== "string" || !input.treatment.trim() || input.treatment.trim().length > 120) {
    return "Enter a treatment (up to 120 characters).";
  }
  if (typeof input.notes !== "string" || input.notes.length > 2000) {
    return "Clinical notes must be 2,000 characters or fewer.";
  }
  if (typeof input.followUp !== "string" || input.followUp.length > 1000) {
    return "Prescription and follow-up must be 1,000 characters or fewer.";
  }
  if (typeof input.appointmentId !== "string" || !/^[a-f0-9-]{36}$/i.test(input.appointmentId)) {
    return "Select a completed appointment for this visit record.";
  }
  return null;
}

async function hashPin(pin, salt) {
  return scrypt(pin, salt, pinLength, { N: 16_384, r: 8, p: 1 });
}

// The `dataFile` argument is kept only so server.js doesn't need to change;
// it's unused now that data lives in Supabase.
function createPatientStore(_dataFile) {
  return {
    async initialize() {
      // Nothing to do locally — run supabase-schema.sql in the Supabase
      // SQL editor once, before first deploy, to create the tables.
      getSupabase();
    },

    async searchByName(name) {
      const supabase = getSupabase();
      const query = normalizeName(name);
      // ilike gives a simple case-insensitive "contains" match comparable
      // to the original in-memory filter.
      const { data, error } = await supabase
        .from("patients")
        .select("name, phone, visits")
        .ilike("name", `%${query}%`);
      if (error) throw new Error(`Failed to search patients: ${error.message}`);
      return data.map(item => ({
        patient: item.name,
        phone: `••••${item.phone.slice(-4)}`,
        visits: item.visits
      }));
    },

    async verifyPin(name, pin) {
      if (!/^\d{8}$/.test(pin)) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("patients")
        .select("name, pin_salt, pin_hash, visits");
      if (error) throw new Error(`Failed to verify PIN: ${error.message}`);
      const matchingName = data.filter(item => normalizeName(item.name) === normalizeName(name));
      for (const patient of matchingName) {
        const candidate = await hashPin(pin, patient.pin_salt);
        const expected = Buffer.from(patient.pin_hash, "hex");
        if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
          return { patient: patient.name, visits: patient.visits };
        }
      }
      return null;
    },

    async addVisit(input) {
      const validationError = validateVisit(input);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }
      const supabase = getSupabase();
      const phone = normalizePhone(input.phone);

      // Guard against duplicate visit records for the same appointment.
      const { data: existingVisits, error: existingError } = await supabase
        .from("patients")
        .select("id, visits");
      if (existingError) throw new Error(`Failed to check visits: ${existingError.message}`);
      if (existingVisits.some(item =>
        (item.visits || []).some(visit => visit.appointmentId === input.appointmentId))) {
        const error = new Error("A visit record already exists for this completed appointment.");
        error.statusCode = 409;
        throw error;
      }

      const { data: matches, error: matchError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone);
      if (matchError) throw new Error(`Failed to look up patient: ${matchError.message}`);
      let patient = matches.find(item => normalizeName(item.name) === normalizeName(input.patient));

      const visit = {
        id: randomUUID(),
        appointmentId: input.appointmentId,
        date: input.date,
        doctor: input.doctor,
        treatment: input.treatment.trim(),
        notes: input.notes.trim(),
        followUp: input.followUp.trim(),
        createdAt: new Date().toISOString()
      };

      let issuedPin = null;

      if (patient && input.resetPin === true) {
        issuedPin = String(randomInt(10_000_000, 100_000_000));
        const pinSalt = randomBytes(16).toString("hex");
        const pinHash = (await hashPin(issuedPin, pinSalt)).toString("hex");
        const updatedVisits = [...(patient.visits || []), visit];
        const { error: updateError } = await supabase
          .from("patients")
          .update({ pin_salt: pinSalt, pin_hash: pinHash, visits: updatedVisits })
          .eq("id", patient.id);
        if (updateError) throw new Error(`Failed to update patient: ${updateError.message}`);
        return { patient: patient.name, visit, issuedPin };
      }

      if (!patient) {
        const pin = String(randomInt(10_000_000, 100_000_000));
        const pinSalt = randomBytes(16).toString("hex");
        const pinHash = (await hashPin(pin, pinSalt)).toString("hex");
        const newPatient = {
          id: randomUUID(),
          name: input.patient.trim(),
          phone,
          pin_salt: pinSalt,
          pin_hash: pinHash,
          created_at: new Date().toISOString(),
          visits: [visit]
        };
        const { error: insertError } = await supabase.from("patients").insert(newPatient);
        if (insertError) throw new Error(`Failed to save patient: ${insertError.message}`);
        issuedPin = pin;
        return { patient: newPatient.name, visit, issuedPin };
      }

      // Existing patient, no PIN reset — just append the visit.
      const updatedVisits = [...(patient.visits || []), visit];
      const { error: appendError } = await supabase
        .from("patients")
        .update({ visits: updatedVisits })
        .eq("id", patient.id);
      if (appendError) throw new Error(`Failed to save visit: ${appendError.message}`);
      return { patient: patient.name, visit, issuedPin: null };
    }
  };
}

module.exports = { createPatientStore, normalizePhone };
