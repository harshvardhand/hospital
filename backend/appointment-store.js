const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const allowedDoctors = new Set([
  "Dr. Nikhil H. Mahanubhav",
  "Dr. Shubhangi N. Mahanubhav",
  "Dr. Nikhil & Dr. Shubhangi"
]);
const allowedSlots = new Set([
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
  "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
  "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
  "08:00 PM", "08:15 PM", "Immediate Priority"
]);

function validDate(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validateAppointment(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Appointment details are required.";
  }
  if (typeof input.patient !== "string" || !input.patient.trim() || input.patient.trim().length > 100) {
    return "Enter a patient name (up to 100 characters).";
  }
  if (typeof input.phone !== "string" || input.phone.length > 25
    || (input.phone && !/^[+\d\s()-]{7,25}$/.test(input.phone))
    || (!input.phone.trim() && input.emergency !== true)) {
    return "Enter a valid phone number.";
  }
  if (!allowedDoctors.has(input.doctor)) return "Select a valid clinician.";
  if (input.emergency === true
    && (input.doctor !== "Dr. Nikhil & Dr. Shubhangi" || input.slot !== "Immediate Priority")) {
    return "Emergency walk-ins must be assigned to both clinicians.";
  }
  if (typeof input.treatment !== "string" || !input.treatment.trim() || input.treatment.trim().length > 120) {
    return "Select a valid treatment.";
  }
  if (!allowedSlots.has(input.slot)) return "Select a valid appointment slot.";
  if (!validDate(input.date)) return "Select a valid appointment date.";
  if (new Date(`${input.date}T00:00:00Z`).getUTCDay() === 3) {
    return "The clinic is closed on Wednesdays. Select another appointment date.";
  }
  if (typeof input.reason !== "string" || input.reason.length > 500) {
    return "The reason must be 500 characters or fewer.";
  }
  return null;
}

function createAppointmentStore(dataFile) {
  let writeQueue = Promise.resolve();

  async function readFile() {
    const contents = await fs.readFile(dataFile, "utf8");
    const appointments = JSON.parse(contents);
    if (!Array.isArray(appointments)) {
      throw new Error("Appointment data file must contain a JSON array.");
    }
    return appointments;
  }

  function updateFile(update) {
    const operation = writeQueue.then(async () => {
      const appointments = await readFile();
      const result = await update(appointments);
      const temporaryFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporaryFile, `${JSON.stringify(appointments, null, 2)}\n`, "utf8");
        await fs.rename(temporaryFile, dataFile);
      } catch (error) {
        await fs.rm(temporaryFile, { force: true });
        throw error;
      }
      return result;
    });
    writeQueue = operation.catch(error => {
      if (error.statusCode !== 409) {
        console.error("Appointment data update failed:", error.message);
      }
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
        await fs.writeFile(dataFile, "[]\n", { flag: "wx" });
      }
    },

    async list() {
      await writeQueue;
      return readFile();
    },

    async add(input) {
      const validationError = validateAppointment(input);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }
      return updateFile(appointments => {
        if (input.emergency !== true && appointments.some(item =>
          item.date === input.date && item.slot === input.slot
          && item.doctor === input.doctor && item.status !== "Completed")) {
          const error = new Error("That clinician and time slot was just booked. Please select another slot.");
          error.statusCode = 409;
          throw error;
        }
        const number = appointments.filter(item => item.date === input.date).length + 1;
        const appointment = {
          id: randomUUID(),
          token: `Token #${String(number).padStart(2, "0")}`,
          patient: input.patient.trim(),
          phone: input.phone.trim(),
          doctor: input.doctor,
          treatment: input.treatment.trim(),
          slot: input.slot,
          date: input.date,
          reason: input.reason.trim(),
          emergency: input.emergency === true,
          status: "Waiting",
          createdAt: new Date().toISOString()
        };
        appointments.push(appointment);
        return appointment;
      });
    },

    async updateStatus(id, status) {
      return updateFile(appointments => {
        const appointment = appointments.find(item => item.id === id);
        if (!appointment) return null;
        appointment.status = status;
        return appointment;
      });
    }
  };
}

module.exports = { createAppointmentStore };
