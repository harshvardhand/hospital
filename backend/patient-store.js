const fs = require("node:fs/promises");
const path = require("node:path");
const {
  randomBytes,
  randomInt,
  randomUUID,
  scrypt: scryptCallback,
  timingSafeEqual
} = require("node:crypto");
const { promisify } = require("node:util");

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

function createPatientStore(dataFile) {
  let writeQueue = Promise.resolve();

  async function readFile() {
    const contents = await fs.readFile(dataFile, "utf8");
    const patients = JSON.parse(contents);
    if (!Array.isArray(patients)) throw new Error("Patient data file must contain a JSON array.");
    return patients;
  }

  async function hashPin(pin, salt) {
    return scrypt(pin, salt, pinLength, { N: 16_384, r: 8, p: 1 });
  }

  function updateFile(update) {
    const operation = writeQueue.then(async () => {
      const patients = await readFile();
      const result = await update(patients);
      const temporaryFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporaryFile, `${JSON.stringify(patients, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
        await fs.rename(temporaryFile, dataFile);
      } catch (error) {
        await fs.rm(temporaryFile, { force: true });
        throw error;
      }
      return result;
    });
    writeQueue = operation.catch(error => {
      if (error.statusCode !== 409) console.error("Patient data update failed:", error.message);
    });
    return operation;
  }

  return {
    async initialize() {
      await fs.mkdir(path.dirname(dataFile), { recursive: true });
      try {
        await fs.access(dataFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await fs.writeFile(dataFile, "[]\n", { flag: "wx", mode: 0o600 });
      }
    },

    async searchByName(name) {
      await writeQueue;
      const patients = await readFile();
      const query = normalizeName(name);
      return patients
        .filter(item => normalizeName(item.name).includes(query))
        .map(item => ({
          patient: item.name,
          phone: `••••${item.phone.slice(-4)}`,
          visits: item.visits
        }));
    },

    async verifyPin(name, pin) {
      await writeQueue;
      const patients = await readFile();
      const matchingName = patients.filter(item => normalizeName(item.name) === normalizeName(name));
      if (!matchingName.length || !/^\d{8}$/.test(pin)) return null;
      for (const patient of matchingName) {
        const candidate = await hashPin(pin, patient.pinSalt);
        const expected = Buffer.from(patient.pinHash, "hex");
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
      const phone = normalizePhone(input.phone);
      return updateFile(async patients => {
        if (patients.some(item => item.visits.some(visit => visit.appointmentId === input.appointmentId))) {
          const error = new Error("A visit record already exists for this completed appointment.");
          error.statusCode = 409;
          throw error;
        }
        let patient = patients.find(item =>
          item.phone === phone && normalizeName(item.name) === normalizeName(input.patient));
        let issuedPin = null;
        if (patient && input.resetPin === true) {
          issuedPin = String(randomInt(10_000_000, 100_000_000));
          patient.pinSalt = randomBytes(16).toString("hex");
          patient.pinHash = (await hashPin(issuedPin, patient.pinSalt)).toString("hex");
        }
        if (!patient) {
          const pin = String(randomInt(10_000_000, 100_000_000));
          const pinSalt = randomBytes(16).toString("hex");
          const pinHash = (await hashPin(pin, pinSalt)).toString("hex");
          patient = {
            id: randomUUID(),
            name: input.patient.trim(),
            phone,
            pinSalt,
            pinHash,
            createdAt: new Date().toISOString(),
            visits: []
          };
          patients.push(patient);
          issuedPin = pin;
        }
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
        patient.visits.push(visit);
        return { patient: patient.name, visit, issuedPin };
      });
    }
  };
}

module.exports = { createPatientStore, normalizePhone };
