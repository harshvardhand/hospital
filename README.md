# Kalpana Hospital website

## Run locally

Requires Node.js 18 or newer. No third-party packages are needed. In
PowerShell, open this folder and run:

```powershell
.\start.ps1
```

The script asks for a staff-console password without displaying it. Then open
<http://127.0.0.1:3000>. Keep the PowerShell window open while using the site.
To start manually instead, set `$env:STAFF_PASSWORD` and run `npm start`.
The server creates and stores appointment requests in
[`data/appointments.json`](./data/appointments.json). Back up that file
regularly. The server binds only to this computer; it is not configured for
public hosting.

Patients can save appointment requests without signing in. Staff sign in with
`drnikhil`, `drshubhangi`, or `staff_admin` and the password set in
`STAFF_PASSWORD`. Staff can review the saved queue, receive real-time updates
when requests arrive or statuses change, update appointment status, and export
a CSV report. The doctor WhatsApp action opens a pre-filled message for staff
to review and send; the site does not send messages automatically.

## Appointment status tracking

After a patient submits a booking, the booking confirmation shows their token.
Patients can open the separate **Patient Portal** to check status using the
booking phone number, appointment date, and token from their confirmation.
While the patient portal stays open, it refreshes the status
every eight seconds. **In Consultation** is shown as “You're being called.”
This is an on-page update only; it does not send SMS or a notification if the
patient closes the page.

## Patient visit history

Only visits recorded by this hospital are shown; appointment requests alone are
not medical history. After an appointment has been marked **Completed**, signed-in
staff can select it in the console, add the actual visit details, and issue a
private 8-digit patient PIN. The PIN is shown once so staff can give it directly
to the patient. Staff can issue a replacement PIN if needed; this invalidates
the old one. No SMS, email, or OTP service is used.

Patients open the separate **Patient Portal**, enter the name recorded by the hospital
and their private PIN in **Past Visit History**, then choose **View My Visit
History**. Staff can search hospital records by patient name in the staff
console. PIN attempts are rate limited, and PINs are stored as salted password
hashes rather than plaintext.

Visit details are stored locally in [`data/patients.json`](./data/patients.json)
alongside the appointment data in `data/appointments.json`. Both files contain
personal information; clinical visit notes are plain text on this computer.
Limit access to the computer and back up these files securely. This local app
is not an encrypted, audited, or compliance-certified medical-record system
and must not be exposed to the internet.

Run the backend tests with `npm test`.
Run the complete automated checks with `npm run verify`.

## Check the website manually

1. Start the server using `.\start.ps1` and open `http://127.0.0.1:3000`.
2. Check that the logo and both doctors' portraits load. Try the mobile menu by
   narrowing the browser window; choose a section and confirm the menu closes.
3. Choose **Book Appointment**, enter a test name and phone number, select a
   doctor, treatment, future date, and time, then submit. The confirmation says
   it is a request, not a confirmed visit. Note the token in the confirmation.
   Patient history and status tracking are not shown in the booking form.
4. Open `data/appointments.json` and confirm the test appointment is there.
5. Choose **Staff Console**. Select `drnikhil` or `drshubhangi`, enter the
   password you set when starting the server, and sign in. Confirm the request
   appears in the queue.
6. Open a second browser window at the same address and submit another
   appointment. The staff queue should update without refreshing. Try **In
   Chair**, **Complete**, and **Export CSV**.
7. Restart the server and sign in again. The appointments and their statuses
   should still be saved in the JSON file. Staff sessions end when the server
   restarts.
8. Open the separate **Patient Portal**, enter the test booking phone number,
   date, and token to track status. Change the appointment from **Waiting** to
   **In Chair** and confirm the portal changes to **You're being called**.
   Mark it **Completed**,
   select it, and add a test visit record.
   Give the one-time PIN displayed by the staff console to the test patient.
   In **Patient Portal** > **Past Visit History**, enter the patient name and
   PIN to verify the record is visible by searching with the patient's name.
   Try an incorrect PIN and confirm it does not reveal the history.
9. Run `npm run verify` in PowerShell. All checks should finish successfully.

Use test contact details while checking the form; the JSON file stores the
entered name and phone number.

## Backend files

- `server.js` serves the site and HTTP API, including the staff-only live event stream.
- `backend/appointment-store.js` validates and persists requests in JSON.
- `backend/patient-store.js` stores completed visit records and salted PIN hashes.
- `backend/auth.js` manages expiring staff sessions.
- `data/appointments.json` stores the appointment queue.
- `data/patients.json` stores hospital patient history and PIN hashes.

The JSON files are plain text and contain personal information. The included
server intentionally listens only on this computer. Putting the site online
requires secure hosting, HTTPS, encrypted production storage, backups, and
appropriate privacy/compliance controls; these cannot be enabled from this
local folder alone.
