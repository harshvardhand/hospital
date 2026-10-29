const { randomUUID } = require("node:crypto");
const { getSupabase } = require("./supabase-client");

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

// Maps a Supabase row (snake_case) to the shape the rest of the app expects
// (camelCase), so index.html / server.js don't need any changes.
function toAppointment(row) {
  return {
    id: row.id,
    token: row.token,
    patient: row.patient,
    phone: row.phone,
    doctor: row.doctor,
    treatment: row.treatment,
    slot: row.slot,
    date: row.date,
    reason: row.reason,
    emergency: row.emergency,
    status: row.status,
    createdAt: row.created_at
  };
}

// The `dataFile` argument is kept only so server.js doesn't need to change;
// it's unused now that data lives in Supabase.
function createSupabaseAppointmentStore(_dataFile) {
  return {
    async initialize() {
      // Nothing to do locally — run supabase-schema.sql in the Supabase
      // SQL editor once, before first deploy, to create the tables.
      getSupabase();
    },

    async list() {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Failed to list appointments: ${error.message}`);
      return data.map(toAppointment);
    },

    async add(input) {
      const validationError = validateAppointment(input);
      if (validationError) {
        const error = new Error(validationError);
        error.statusCode = 400;
        throw error;
      }
      const supabase = getSupabase();

      if (input.emergency !== true) {
        const { data: conflicting, error: conflictError } = await supabase
          .from("appointments")
          .select("id")
          .eq("date", input.date)
          .eq("slot", input.slot)
          .eq("doctor", input.doctor)
          .neq("status", "Completed")
          .limit(1);
        if (conflictError) throw new Error(`Failed to check slot: ${conflictError.message}`);
        if (conflicting.length > 0) {
          const error = new Error("That clinician and time slot was just booked. Please select another slot.");
          error.statusCode = 409;
          throw error;
        }
      }

      const { count, error: countError } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("date", input.date);
      if (countError) throw new Error(`Failed to count appointments: ${countError.message}`);

      const appointment = {
        id: randomUUID(),
        token: `Token #${String((count || 0) + 1).padStart(2, "0")}`,
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

      const { error: insertError } = await supabase.from("appointments").insert({
        id: appointment.id,
        token: appointment.token,
        patient: appointment.patient,
        phone: appointment.phone,
        doctor: appointment.doctor,
        treatment: appointment.treatment,
        slot: appointment.slot,
        date: appointment.date,
        reason: appointment.reason,
        emergency: appointment.emergency,
        status: appointment.status,
        created_at: appointment.createdAt
      });
      if (insertError) throw new Error(`Failed to save appointment: ${insertError.message}`);
      return appointment;
    },

    async updateStatus(id, status) {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("appointments")
        .update({ status })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw new Error(`Failed to update appointment: ${error.message}`);
      return data ? toAppointment(data) : null;
    }
  };
}

module.exports = { createSupabaseAppointmentStore };
