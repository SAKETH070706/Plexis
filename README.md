# 🌟 Plexis — Multi-Tenant Event Workforce CRM & Smart Attendance Engine

> **Live Deployment & Comprehensive Test Documentation**  
> *Engineered for high-reliability event workforce management, geofenced GPS tracking, live overtime verification with hardware EXIF extraction, and automated itemized payouts.*

---

## 📑 Table of Contents
1. [Overview & System Architecture](#-overview--system-architecture)
2. [Render Deployment Guide](#-render-deployment-guide)
3. [Test Suite Execution & Results (35/35 Passing)](#-test-suite-execution--results-3535-passing)
4. [Edge Cases Handled in Depth](#-edge-cases-handled-in-depth)
   - [A. Geofencing & GPS Telemetry](#a-geofencing--gps-telemetry)
   - [B. Time-Gating & Attendance Gating](#b-time-gating--attendance-gating)
   - [C. 30-Minute Grace Period & Shift Extension](#c-30-minute-grace-period--shift-extension)
   - [D. Overtime Tracking & End-of-Session Proof of Work](#d-overtime-tracking--end-of-session-proof-of-work)
   - [E. Multi-Tenant Studio Isolation & Security](#e-multi-tenant-studio-isolation--security)
   - [F. Financial Settlement & Itemized Payouts](#f-financial-settlement--itemized-payouts)
   - [G. Hardware & Battery Failures (Exception Requests)](#g-hardware--battery-failures-exception-requests)
5. [Demo Credentials & Live Test-Drive Walkthrough](#-demo-credentials--live-test-drive-walkthrough)
6. [Local Development Setup](#-local-development-setup)

---

## 🏛 Overview & System Architecture

**Plexis** is a full-stack, enterprise-grade Event Workforce Management & CRM platform tailored for photography studios, event management agencies, and production houses. It bridges the gap between field freelancers and studio supervisors with real-time auditability.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               PLEXIS CLIENT (React 18 SPA)             │
                    │  • Interactive Leaflet/OSM Pin Picker                  │
                    │  • High-Accuracy Geolocation Telemetry                 │
                    │  • Client-Side EXIF Hardware Extraction (exifr)        │
                    │  • Real-Time Socket.io Live Status Tickers             │
                    └──────────────────────────┬─────────────────────────────┘
                                               │ HTTPS / WSS
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               PLEXIS API (Node.js & Express)           │
                    │  • Multi-Tenant Organization Isolation                 │
                    │  • Haversine Geofence Calculation Engine               │
                    │  • Server-Authoritative Time Gating & Cutoffs          │
                    │  • Immutable Audit Trail Logger                        │
                    └──────────────┬──────────────────────────┬──────────────┘
                                   │                          │
                 Cloudinary Stream │                          │ MongoDB Native Driver
                                   ▼                          ▼
               ┌───────────────────────┐          ┌──────────────────────────┐
               │ Cloudinary CDN        │          │ MongoDB Atlas Cluster    │
               │ • Verified EXIF Store │          │ • Multi-Tenant DB        │
               │ • Overtime Proof URLs │          │ • Geospatial Indexes     │
               └───────────────────────┘          └──────────────────────────┘
```

---

## 🚀 Render Deployment Guide

Deploying Plexis on **Render** requires two services: a **Web Service (Backend)** and a **Static Site (Frontend)**.

### 1. Backend Web Service (`Plexis API`)
1. In your Render Dashboard, click **New +** → **Web Service**.
2. Connect the GitHub repository: `https://github.com/SAKETH070706/Plexis`.
3. Set the following configuration:
   - **Name**: `plexis-api`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add **Environment Variables** in the Render dashboard:
   | Key | Value / Description |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `5000` (Render binds automatically) |
   | `MONGO_URI` | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/crm?retryWrites=true&w=majority` |
   | `JWT_SECRET` | Any strong cryptographic string (e.g. `plexis_jwt_prod_secret_2026`) |
   | `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name (e.g. `cc4mb4xr`) |
   | `CLOUDINARY_API_KEY` | Cloudinary API Key |
   | `CLOUDINARY_API_SECRET` | Cloudinary API Secret |
5. Click **Create Web Service**. Note your backend URL (e.g., `https://plexis-api.onrender.com`).

---

### 2. Frontend Static Site (`Plexis Client`)
1. Click **New +** → **Static Site**.
2. Connect the repository: `https://github.com/SAKETH070706/Plexis`.
3. Set the following configuration:
   - **Name**: `plexis-app`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `build`
4. In **Redirects / Rewrites**:
   - **Source**: `/*`
   - **Destination**: `/index.html`
   - **Action**: `Rewrite` *(Essential for React SPA client-side routing)*
5. In **Environment Variables**:
   | Key | Value |
   | :--- | :--- |
   | `REACT_APP_API_URL` | `https://plexis-api.onrender.com/api` |
6. Click **Create Static Site**.

---

## 🧪 Test Suite Execution & Results (35/35 Passing)

The backend features an end-to-end automated test suite built with **Jest** and **Supertest**, executing against an isolated MongoDB test database with strict data isolation.

### How to Run the Tests
```bash
cd backend
npm test
```

### Execution Results
```text
PASS tests/phase3_attendance.test.js (10.384 s)
PASS tests/phase2_events.test.js (5.767 s)
PASS tests/phase4_payouts.test.js (6.029 s)
PASS tests/phase1_models.test.js
PASS tests/auth.test.js
PASS tests/validators.test.js

Test Suites: 6 passed, 6 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        27.596 s
Ran all test suites.
```

### Detailed Test Coverage Matrix

| Suite | Test Description | Purpose / Validation | Status |
| :--- | :--- | :--- | :---: |
| **`phase3_attendance.test.js`** | `verify check-in within geofence radius` | Tests Haversine distance $\le$ radius; auto-verifies session | ✅ PASS |
| | `flag check-in outside geofence for manual review` | Ensures worker > radius is not dropped; flagged `manual_review` | ✅ PASS |
| | `reject check-in if worker is not assigned` | Protects event boundary from unassigned freelancers (403) | ✅ PASS |
| | `prevent duplicate check-in sessions (double tap)` | Idempotent check-in; returns active session without duplicates | ✅ PASS |
| | `detect overtime when checkout exceeds scheduled shift end` | Verifies server-calculated overtime minutes when checkout > scheduled | ✅ PASS |
| | `allow Admin to review and approve overtime claim` | Validates approval of extra minutes & creates `AuditLog` | ✅ PASS |
| | `allow worker to submit exception request & admin approve` | Tests battery-dead scenario; creates retroactive attendance | ✅ PASS |
| | `extend shift and prevent auto-checkout from stopping shift` | Ensures `isExtended: true` cancels 30-min auto-stop cutoff | ✅ PASS |
| **`phase2_events.test.js`** | `create event with GPS coordinates and radius` | Validates location object, lat/lon ranges, radius defaults | ✅ PASS |
| | `auto-assign requested workers based on skills` | Matches worker skills with required slots | ✅ PASS |
| | `open assignment pool allowing freelancers to apply` | Tests open shift discovery and application submission | ✅ PASS |
| | `prevent double-booking workers on conflicting dates` | Rejects scheduling overlapping shifts for the same worker | ✅ PASS |
| | `respect requiredWorkers capacity limit` | Flags event as `isFull: true` once slots are filled | ✅ PASS |
| | `cancel event and release assignments` | Releases slots and cascades cancellations cleanly | ✅ PASS |
| | `filter events by date range and status` | Validates search queries and date window bounds | ✅ PASS |
| | `prevent non-admin users from creating events` | Enforces RBAC permissions across studio roles | ✅ PASS |
| **`phase4_payouts.test.js`** | `calculate itemized payout upon completed attendance` | Tests base session pay calculation | ✅ PASS |
| | `include approved overtime pay based on hourly rate` | Computes `(overtimeMinutes / 60) * overtimeRate` accurately | ✅ PASS |
| | `deduct platform commission fee` | Calculates net freelancer payout vs gross studio billing | ✅ PASS |
| | `query freelancer earnings ledger` | Distinguishes `totalPaid` vs `pendingEarnings` | ✅ PASS |
| | `bulk mark payouts as paid` | Updates status to `paid` and records transaction timestamp | ✅ PASS |
| | `record disbursement payment proof (UPI/Ref ID)` | Stores reference proof for bank reconciliation | ✅ PASS |
| **`phase1_models.test.js`** | `validate organization studioCode uniqueness` | Enforces 6-char studio code uniqueness across tenants | ✅ PASS |
| | `enforce required fields on attendance records` | Schema-level validation on check-in timestamps | ✅ PASS |
| | `enforce valid status enums` | Validates `checked_in`, `completed`, `manual_review` | ✅ PASS |
| | `cascade timestamps on update` | Validates Mongoose pre-save updatedAt hooks | ✅ PASS |
| **`auth.test.js`** | `register organization admin with studioCode generation` | Generates unique 6-character alphanumeric code | ✅ PASS |
| | `register freelancer with studioCode binding` | Associates freelancer directly with organization | ✅ PASS |
| | `authenticate user and issue signed JWT` | Validates token payload (`id`, `role`, `organizationId`) | ✅ PASS |
| | `reject invalid login credentials` | Rejects wrong password with 400 status | ✅ PASS |
| | `protect private endpoints without valid bearer token` | Returns 401 Unauthorized on unauthenticated requests | ✅ PASS |
| **`validators.test.js`** | `validate 10-digit Indian phone number format` | Validates `^[6-9]\d{9}$` pattern across users/leads | ✅ PASS |
| | `validate 24-hour time string format (HH:MM)` | Validates start and end times | ✅ PASS |
| | `validate latitude (-90 to 90) and longitude (-180 to 180)` | Ensures valid coordinate inputs from map picker | ✅ PASS |
| | `validate positive non-zero session pay and overtime rates` | Prevents negative or zero hourly pay rates | ✅ PASS |

---

## 🛡️ Edge Cases Handled in Depth

### A. Geofencing & GPS Telemetry
1. **GPS Jitter & Multipath Drift**:
   - Geofence calculations employ the **Haversine formula** calculating spherical great-circle distance.
   - If GPS accuracy is degraded (e.g. indoors with accuracy $>50$m), check-in is **not discarded**. Instead, the record is tagged with the telemetry accuracy reading and flagged for review if strictly outside the boundary.
2. **Outside Radius Check-In**:
   - Instead of abruptly blocking the worker on-site, the system records the check-in with status `manual_review` and computes `distanceFromVenue` (in meters).
   - The supervisor dashboard highlights the distance in red (e.g., `⚠️ Outside (320m)`), allowing the studio manager to verify whether the worker was parked nearby or loading equipment.
3. **Hardware / Browser Geolocation Denial**:
   - If the worker denies browser GPS permissions or runs a browser without hardware GPS, clear actionable feedback is provided: *"GPS Error: Permission denied. Please allow location access or submit a manual exception request."*

---

### B. Time-Gating & Attendance Gating
1. **Premature Check-In Protection**:
   - The check-in window opens strictly **30 minutes prior** to `startTime`.
   - Before this time, the check-in button remains securely locked with a live countdown: `🔒 Check-in opens at 09:30 AM (30 mins prior to shift)`.
2. **Concluded Event Gate**:
   - If a freelancer attempts to check in more than **60 minutes after** the event's `endTime`, check-in is permanently locked with the status: `🔒 Event concluded. Check-in closed.`.
3. **Double-Tap / Idempotency Protection**:
   - If a freelancer double-taps the check-in button or encounters network retries, the server checks for an active session (`status: { $in: ['checked_in', 'manual_review'] }`).
   - Returns the existing active session without duplicating records or corrupting billing records.

---

### C. 30-Minute Grace Period & Shift Extension
1. **Automated End-of-Shift Grace Window**:
   - When the clock reaches scheduled `endTime`, a 30-minute grace period modal appears with a live ticking countdown (`formatCountdown`).
   - If the worker is inactive and the timer reaches `00:00`, the server executes an **Auto-Checkout** cutoff:
     - Sets checkout time to `scheduledEnd + 30 minutes`.
     - Records `checkOutMethod: 'auto'`.
     - Logs an immutable `AuditLog` entry.
2. **Shift Extension Deactivates Auto-Cutoff**:
   - Clicking **"Extend Shift"** calls `POST /api/attendance/extend`:
     - Sets `isExtended: true` and `extendedAt = new Date()`.
     - **Deactivates the 30-minute grace countdown immediately.**
     - **Does NOT trigger the camera prematurely.**
     - The backend `POST /api/attendance/auto-checkout` rejects auto-stops if `attendance.isExtended === true` (returns 400).

---

### D. Overtime Tracking & End-of-Session Proof of Work
1. **Live Ticking Overtime Display**:
   - Once overtime commences, the shift card displays a live ticking counter: `⚡ Overtime in Progress: +XX mins` (`+Xm Ys` updating every second).
2. **Checkout Routing (Overtime vs Standard)**:
   - **No Overtime Worked (`now <= scheduledEnd`)**: Standard instant GPS checkout with zero photo prompts.
   - **Overtime Worked (`now > scheduledEnd` or `isExtended: true`)**: Opens the dedicated **"Shift Conclusion & Overtime Verification" Modal**.
3. **End-of-Shift Proof Requirement**:
   - Freelancer must capture a photo of the completed venue/stage via `<input type="file" accept="image/*" capture="environment">`.
   - **EXIF Metadata Extraction**: Client-side `exifr` parses hardware timestamp (`DateTimeOriginal`), camera model (`Make`, `Model`), and photo GPS coordinates.
   - **Cloudinary Direct Stream**: Uploaded to Cloudinary with `image_metadata: true` for server-side verification.
   - **Atomic Operation**: The photo is uploaded, verified, and followed immediately by checkout timestamp recording.
4. **Supervisor Settlement & Adjustment**:
   - In [`AttendanceMonitor.js`](file:///d:/WEB%20DEVELOPMENT/CRM/frontend/src/components/AttendanceMonitor.js), supervisors see the `⚡ +XXm OT` badge alongside checkout time.
   - Proof photos display shutter timestamp matched against checkout time, device model, and venue distance.
   - Supervisors can **"Approve Overtime Payout"** or **"Adjust Overtime Hours"** (with quick presets `30m`, `60m`, `90m`, `120m` or custom input), which automatically syncs the payout ledger.

---

### E. Multi-Tenant Studio Isolation & Security
1. **Studio Code Onboarding**:
   - Every studio receives a unique 6-character alphanumeric code (e.g. `STU-29KA`).
   - Freelancers register by inputting the Studio Code, ensuring they are bound exclusively to their organization.
2. **Strict Data Boundary**:
   - Every database query enforces `{ organizationId: req.user.organizationId }`.
   - Freelancers can never access events, leads, attendance logs, or payout records belonging to another studio.
3. **Role-Based Access Control (RBAC)**:
   - Admins possess exclusive permissions to create events, review overtime, approve manual requests, and disburse payouts.
   - Freelancers have scoped access to their assigned shifts, open shifts pool, personal GPS check-in, and personal earnings ledger.

---

### F. Financial Settlement & Itemized Payouts
1. **Dynamic Overtime Rate Calculation**:
   - Overtime pay is computed on an hourly basis: `(approvedMinutes / 60) * overtimeRate`.
2. **Real-time Recalculation Hook**:
   - When an admin adjusts overtime hours from 60 minutes to 45 minutes, [`calculateAndSavePayout`](file:///d:/WEB%20DEVELOPMENT/CRM/backend/routes/payouts.js) re-runs automatically to synchronize the net payout in the ledger.
3. **Disbursement Tracking**:
   - Supports marking payouts as `paid` with bank/UPI transaction references and transaction dates.

---

### G. Hardware & Battery Failures (Exception Requests)
1. **Dead Battery / In-Basement Signal Loss**:
   - If a worker's phone battery dies or GPS cannot penetrate a basement banquet hall, they can click **"Report Attendance Issue"** on the Freelancer Portal.
   - Submits a request with `issueType` (`missing_checkin`, `missing_checkout`, or `both`), estimated timing, and a required explanation note.
2. **Admin Review Queue**:
   - Supervisors review pending exceptions with one-click **"Approve"** or **"Reject"**.
   - Approval automatically creates an attendance record marked `checkInMethod: 'manual'` and audited by the supervisor's user ID.

---

## 🔑 Demo Credentials & Live Test-Drive Walkthrough

For immediate verification and grading, the following pre-configured credentials can be used:

### 1. Studio Admin Account
- **URL**: `/login`
- **Email**: `lgksaketh@gmail.com`
- **Password**: `admin123` *(or your registered admin password)*
- **Studio Name**: `royal photo studio`
- **Studio Code**: `STU-29KA`
- **Capabilities**: Full access to Events Manager, Attendance Monitor, Crew Manager, Payouts Ledger, Leads CRM.

### 2. Freelancer Account
- **URL**: `/login`
- **Email**: `bhaaai12858@gmail.com`
- **Password**: `freelancer123` *(or your registered freelancer password)*
- **Studio Association**: Linked to `royal photo studio` (`STU-29KA`)
- **Capabilities**: Freelancer Portal, GPS Check-in, Shift Extension, Overtime Checkout Modal, Personal Earnings.

---

### 3. Step-by-Step Test-Drive Workflow
1. **Log in as Admin** (`lgksaketh@gmail.com`):
   - Go to **Events Manager** → click **"+ Create New Event"**.
   - Use the **Interactive Map Picker** to search a venue or drop a pin.
   - Set start time, end time, session pay, overtime rate, and assign worker.
2. **Log in as Freelancer** (`bhaaai12858@gmail.com`):
   - Open **Freelancer Portal**.
   - Notice the shift card indicating geofence distance and check-in window.
   - Click **"📍 GPS CHECK IN"** (simulates or reads live browser GPS).
   - Once checked in, shift status becomes `● Active Shift In-Progress`.
3. **Simulate Shift Extension & Overtime**:
   - Click **"Extend Shift"** (or trigger from grace modal). Notice grace modal closes immediately, countdown terminates, and live overtime banner appears (`⚡ Overtime in Progress: +XX mins`).
   - Notice **no photo prompt** appears prematurely.
4. **Checkout with Overtime**:
   - Click **"CHECK OUT NOW"**.
   - Notice the **"Shift Conclusion & Overtime Verification" Modal** opens.
   - Click **"📸 Take Proof Photo"**, snap or select a photo.
   - Notice the preview appears with `✅ Proof Photo Captured` and extracted hardware details.
   - Click **"Submit Proof & Check Out"**. Shift completes, uploads to Cloudinary, and records pending overtime.
5. **Supervisor Verification**:
   - Log back into Admin → open **Attendance Monitor**.
   - See the checkout time with `⚡ +XXm OT`.
   - Click **"📸 View Proofs"** to inspect shutter timestamp, EXIF camera model, and venue distance.
   - Click **"Adjust Overtime Hours"** or **"Approve Overtime Payout"**.
   - Check **Payouts Ledger** to verify the payout is ready for disbursement!

---

## 💻 Local Development Setup

### Prerequisites
- Node.js $\ge 18$
- MongoDB Atlas or local MongoDB instance

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/SAKETH070706/Plexis.git
cd Plexis

# 2. Setup & run Backend
cd backend
npm install
cp .env.example .env   # configure MONGO_URI, JWT_SECRET, CLOUDINARY credentials
npm run dev            # runs on http://localhost:5000

# 3. Setup & run Frontend (in a new terminal)
cd ../frontend
npm install
npm start              # runs on http://localhost:3000
```

---

## 📄 License
This project is licensed under the MIT License.