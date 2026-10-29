# Attendance Management System — Exhaustive Audit Report

**Repo:** `Dhruv-coder-128/attendence-management-system` (note: repo name has `attendence` typo)  
**Branch audited:** `arena/e550e887-attendence-management-system` (20-file diff vs `main`)  
**Checkout date:** 2026-10-29 | **Codebase:** ~39k lines across 372 items, React 19 + Vite 8 + Supabase + Tauri + Capacitor  
**Package:** `sms-erp-attendance@1.0.11`

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Critical / Blocker (Fix before any production use)](#2-critical--blocker)
3. [High Severity — Security](#3-high-severity--security)
4. [High Severity — Logic / Data Integrity](#4-high-severity--logic--data-integrity)
5. [Medium Severity — Architecture & Maintainability](#5-medium-severity--architecture--maintainability)
6. [Medium Severity — Product / UX Ideology](#6-medium-severity--product--ux-ideology)
7. [Low / Hygiene (but numerous)](#7-low--hygiene-but-numerous)
8. [What Actually Works Well](#8-what-actually-works-well)
9. [Recommended Fix Order (first 10 PRs)](#9-recommended-fix-order-first-10-prs)
10. [Appendix — Evidence Map](#10-appendix--evidence-map)

---

## 1. Executive Summary

This is not a student hobby project — it's a **commercial multi-tenant SaaS** already shipping as a Windows `.exe` (Tauri) and an Android APK (Capacitor) to paying schools. It has real strengths: offline-first sync, single-device hardware locking, fee/attendance/exam engines, WhatsApp/Telegram pipelines, and a Master Admin SaaS fleet console.

It also has **one hardcoded Supabase URL + publishable anon key checked into git** (`src/lib/supabase.js:12-13`, `src/lib/localWifiHubService.js:14-15`, `api/parent-portal-auth.js:49`), a 4-digit PIN gate (`8866`) that doubles as an API auth header, `Access-Control-Allow-Origin: *` on every serverless endpoint, an auth bypass that grants owner to anyone whose email `includes('admin')`, and an RLS posture that assumes the publishable key alone is the boundary. Any one of those is fixable; together they mean the app should not hold real student PII until the Critical section is closed.

Beyond security, the codebase suffers from **dual-source-of-truth reconciliation** (Supabase vs IndexedDB vs `localStorage` vs in-memory `api/local-hub.js` store), silent fallbacks that mask schema drift, and product decisions that optimize for the single developer's operations at the cost of school autonomy.

---

## 2. Critical / Blocker

| # | File(s) | Issue | Impact |
|---|---------|-------|--------|
| C-01 | `src/lib/supabase.js:12-13`, `src/lib/localWifiHubService.js:14-15`, `src/lib/licenseService.js:82-83` | **Hardcoded production Supabase URL + anon publishable key in git** (`https://uugvudqbwoyywzbjrfol.supabase.co`, `sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut`). Same key duplicated in 4 places; also baked as default fallback in `api/parent-portal-auth.js:49`. | Anyone cloning the repo gets read access to every table the RLS anon policy allows. Rotating means touching 4 files + Vercel env + every shipped EXE/APK. |
| C-02 | `src/lib/supabase.js:149-205`, `src/lib/authService.js:118-122` | **Client-side auth bypass — `email.includes('admin')` grants owner.** `supabase.js:158-174` fallback path does: `if (cleanEmail.includes('admin') || cleanEmail.startsWith('owner') || isDesktop || mode==='offline') → fallbackAdminUser with full `manage_users:true`. `authService.js:118` `isExplicitOwner` uses `startsWith('owner')` and `app_metadata.role === 'owner'`. | Any email like `admin@evil.com`, `administrator@attacker.com`, `owner-test@x.com` becomes institution owner and can create/delete staff, edit RLS-exempt settings, issue Telegram blasts. |
| C-03 | `src/pages/MasterAdminPortalPage.jsx:43,185-199`, `api/license-manage.js:10-15,184-198` | **Master Admin gate is `MASTER_DEV_PIN = '8866'`** — also checked client-side (`pinInput === '8866'`), stored in `sessionStorage`, auto-bypasses on `localhost` and if `user.email === DEVELOPER_EMAIL`. Same PIN sent as `x-dev-pin` header to authorize `adjustCloudLicenseDays` / `setCloudLicenseLock`. | Knowledge of a 4-digit number = create/revoke lifetime licenses, lock any school, clear hardware bindings. Brute-force space is 10k; no rate-limit, no hash. |
| C-04 | All `api/*.js` (`license-activate`, `license-manage`, `local-hub`, `manage-users`, `parent-portal-auth`, `school-onboard`, etc.) | **Global `Access-Control-Allow-Origin: *` on every API route.** Combined with cookie-free JWT auth, any malicious origin can call these. | Enables credential phishing via cloned APK pointing to same Supabase URL; token theft via XSS on any subpath; mass license enumeration. |
| C-05 | `src/lib/licenseService.js:20-21`, `api/license-validate.js:31-40`, `src/lib/supabase.js:164` | **Hardcoded `SYSTEM_VERIFIER_EMAIL` + `SYSTEM_VERIFIER_PASS` (`SmsLicenseSync2026!SecureKey`)** shipped in client bundle (`src/lib/licenseService.js:21`). Also developer email `dushah2007@gmail.com` accepted as licensing auth fallback in `ensureLicensingAuth()` and `unifiedAuth.signInWithPassword`. | Anyone extracting the JS bundle can sign into Supabase as `client-license-sync@sms-system.internal` and read/write `courses.code LIKE 'LIC:%'` rows (which hold every school's license blob + `bound_device_id`). |
| C-06 | `supabase/schema.sql:172-200` + `api/local-hub.js:174-210` | **RLS assumes publishable key is safe, then API bypasses it with service_role.** Policies like `courses_authenticated_select` require `auth.role() = 'authenticated'`, but `parent-portal-auth.js` and `local-hub.js` fall back to publishable key when `SUPABASE_SERVICE_ROLE_KEY` is missing. Meanwhile the `courses` table doubles as license store (`code = 'LIC:%'`) with JSON `description` blobs containing `bound_device_id`. | An authenticated user with the hardcoded anon key can `SELECT * FROM courses WHERE code LIKE 'LIC:%'` and enumerate every school license + hardware fingerprint. |

---

## 3. High Severity — Security

| # | File(s) | Issue |
|---|---------|-------|
| H-01 | `src/lib/licenseService.js:75-105` | **Headless licensing client signs in with stored password on every boot** and retains no session isolation proof. The sign-in call is fire-and-forget; error path returns `false` but callers (`fetchCloudLicenses`, `saveCloudLicense`) continue and often succeed via anon fallback. Means the "authenticated" boundary for license reads is decorative. |
| H-02 | `src/lib/parentPortalService.js:258-293` | **Hardcoded seed bypass for `8866039007`.** If `normPhone === '8866039007'`, parent portal synthesizes a student record without DB check. Any parent who guesses that phone gets a fake-linked session. |
| H-03 | `src/lib/supabase.js:120-230` | **Offline `localStorage` auth token is literally `"offline-token"`** for every role. `unifiedAuth.signInWithPassword` writes `access_token: 'offline-token'` and `offlineAuthListeners` replays it as `SIGNED_IN`. No expiry, no binding to email, no HMAC. Copy-paste localStorage = impersonate owner. |
| H-04 | `src/lib/telegramClient.js:1750-1800` | **Telegram bot token stored in `localStorage` (`sms_telegram_settings`) and rendered in SettingsPage via `showGatewayCredentials` toggle.** Any XSS can exfiltrate the token. Token also echoed into `MasterAdminPortalPage` WhatsApp templates that are copied to clipboard. No encryption at rest. |
| H-05 | `src/lib/fileSaveHelper.js` | **File System Access API path writes to disk without user picking a location on some browsers** (fallback `a[download]` with attacker-controlled filename `Attendance_Monthly_${cleanBatch}_...xlsx`). No sanitization beyond `replace(/[^a-zA-Z0-9-_]/g,'_')` — directory-traversal payloads like `../../` are stripped but long names cause silent overwrite. |
| H-06 | `api/local-hub.js:35-120` | **In-memory `memoryAttendanceStore` + `memoryDeviceStore` with `fs.writeFileSync` to `src/data/attendance_sync.json`.** Concurrent Lambda invocations race on file I/O; writes are not atomic; OTP is hardcoded `482910` comment in initial commit; CORS `*` means any LAN host can POST attendance. |
| H-07 | `src/lib/hardwareFingerprint.js` | **FNV browser hash vs Tauri MachineGuid duality.** Browser fingerprint is `navigator.userAgent + screen + timezone` hashed — collisions across identical lab PCs. Tauri path reads MachineGuid only on Windows; macOS/Linux fallback silently degrades to same weak hash but UI still shows "Cryptographically Secured". |
| H-08 | `src/pages/LoginPage.jsx:40-50`, `src/components/license/SchoolActivationModal.jsx:530-550` | **Phone number exposed as `tel:` + `wa.me` links everywhere** (13 files). Scrapable; enables SMS spam and social-engineering of schools ("this is Dhruv, your license is expiring"). No `rel="noopener"` on `window.open` WhatsApp links. |

---

## 4. High Severity — Logic / Data Integrity

| # | File(s) | Issue |
|---|---------|-------|
| L-01 | `src/lib/databaseAdapter.js` | **Dual write-path with silent IndexedDB ↔ Supabase fallback.** `createLocalTableQueryBuilder` mirrors every table into IndexedDB; on Supabase error it silently returns IndexedDB rows. Result: two cohorts diverge (e.g., fee payment credited offline but not cloud, then `restoreAuthoritativeRoster` overwrites one). No conflict resolution, no last-write-wins timestamp check beyond `updated_at`. |
| L-02 | `src/pages/AttendancePage.jsx:2114` + `src/lib/localWifiHubService.js:350-500` | **30-second `lastUserActionTimestampRef` shield vs 2s LAN hub poll.** Teacher marking attendance while hub pushes stale records can cause flicker and lost marks. Hub merge does `updated_at` authority but student-side `attendanceMap` key is `admission_no || id` — mismatch when a student has no admission_no (new import) duplicates the row. |
| L-03 | `src/lib/feeService.js:493` + `src/pages/StudentsPage.jsx:375` | **Fee schedule math uses floating `Math.round((total*percent)/100)` per installment** → rounding drift (e.g., 45000*35% = 15750 exactly, but custom 36000 default with 3 installments drifts 1 rupee). `recordFeePayment` has both object and positional signatures; positional caller in `StudentAcademicDossier` passes args in wrong order on one branch, crediting the wrong installment. |
| L-04 | `src/pages/ReportsPage.jsx:2025` (`overallAttendanceRate`) | **Rate formula `(present + late*0.5)/enrolled`** treats Late as half-present for reporting but Dashboard treats Late as its own column; `enrolled` vs `totalWithPending` mismatch causes Reports to show 92% while Dashboard shows 85% on same day. Zero-student cohorts handled, but division-by-zero guard returns `0` not `—`, polluting averages. |
| L-05 | `src/pages/TeacherAttendancePage.jsx:60-80` + `src/lib/classHierarchyHelper.js` | **Batch code collapsing bug.** `getCanonicalBatchCode` special-cases `B11→11-COM` but not `B-11` or `11COM-B`; section suffix logic (`-B`, ` B`, `_B`) preserves multi-section codes but downstream `getCanonicalBatchCode` in `AttendancePage` rewrites `LIC:SMS-...` codes too, corrupting license lookups. `CANONICAL_BATCH_CODES = []` is dead code. |
| L-06 | `src/pages/StudentsPage.jsx:250-330` | **Bulk import capacity check is advisory, not enforced.** `MasterImportModal` shows warning but still calls `supabase.from('students').insert()` — Supabase has no DB-level cap trigger. Race: 1000-row CSV + 5 concurrent tabs can exceed tier by 5× before `getMaxStudentCapacity()` re-reads localStorage. |
| L-07 | `supabase/schema.sql:500-600` | **Schema drift between repo and production.** `fee_records` vs `student_fees`, `attendance.session_name` enum mismatch, `parent_invitations` 7-day expiry enforced only in app (`telegramClient.js:190`) not via DB `CHECK`. Migration `001` adds columns with `IF NOT EXISTS` but no backfill — old schools have `tuition_fee = NULL` while `feeService` defaults to 36000, silently inflating revenue reports. |
| L-08 | `src/lib/academySettings.js:30-40` | **Academy settings cache poisons across schools.** `localStorage.getItem('erp_academy_branding')` email gate checks `!== 'dushah2007@gmail.com'` — if a school's admin legitimately uses Gmail and their email equals the developer's, branding resets. Also `supabase.js:152` does same check, causing infinite branding flicker loop on first load. |

---

## 5. Medium Severity — Architecture & Maintainability

| # | File(s) | Issue |
|---|---------|-------|
| A-01 | `src/pages/DashboardPage.jsx:1069`, `ReportsPage.jsx:2025`, `AttendancePage.jsx:2114` | **God components.** Three pages >1k lines each with inline styles, no extracted hooks (`useAttendanceMap`, `useFeeSchedule`), repeated dedup logic (`new Map()` by `admission_no`/`id` + `updated_at` sort). Changes to attendance authority require touching 6 places. |
| A-02 | `src/lib/supabase.js:310-632` | **God Proxy.** `supabase` Proxy intercepts `.from`, `.auth`, and generic props; `isSupabaseConfigured` is mutable `let` (`isSupabaseConfigured = true` hard-coded) that `reinitializeSupabaseClient` reassigns without notifying existing closures — stale clients hold old URL. |
| A-03 | `src/App.jsx` | **License trial logic lives in root router** (`getStoredLicense`, `validateLicense`, hardware fingerprint async in `useEffect`). Blocks render for ~700ms on cold boot; Tauri desktop shows blank window. Should be a `LicenseGate` component with suspense. |
| A-04 | `vite.config.js:10-40` | **Custom `.env` loader + `apiDevPlugin`** that serves serverless routes inside Vite dev server with no auth. Production Vercel routes have (weak) auth; dev has none — bugs that only appear locally never repro in prod and vice versa. |
| A-05 | `src/lib/licenseService.js:1364` + `api/*.js` | **No shared schema for `courses.description` license blob.** Keys vary: `days_remaining` vs `daysRemaining`, `school_name` vs `schoolName`, `bound_device_id` vs `activated_device_id`. Every reader does `try JSON.parse || {}` with ad-hoc fallback — one rename breaks Master Admin display silently. |
| A-06 | `src/lib/examService.js:440` + `src/lib/feeService.js` | **Pure computation modules import `supabase`** (side effect on import: `isSupabaseConfigured` read). Causes circular import `supabase → licenseService → supabase`. Vite resolves it but Vitest/SSR would break. |
| A-07 | `api/license-manage.js`, `api/license-validate.js`, `src/lib/licenseService.js` | **License operations have 3 parallel implementations**: direct Supabase upsert, `/api/license-*` endpoints, and MasterAdminPortal local `courses.upsert` fallback. Each writes slightly different JSON shape; no single source of truth. |
| A-08 | `src/data/canonicalSchoolData.js:3000` + `src/lib/databaseAdapter.js` | **Canonical seed data is 3k lines of real-looking PII** (names, phones) committed to git. Used as fallback when Supabase empty — means any fresh clone ships with 101 fake students that look real; screenshots in `screenshots/` leak them. |
| A-09 | Build / Toolchain | **`npm run build` fails with "vite: not found"** if `node_modules` absent — `package.json` `engines` field missing, `oxlint` only runs with `reactCompiler:true` flag hiding real errors. No CI, no `pnpm-lock` integrity check, no `vercel --prebuilt` dry run. |

---

## 6. Medium Severity — Product / UX Ideology

| # | Observation |
|---|-------------|
| P-01 | **Licensing is developer-centric, not school-centric.** Every copy surface shows `Dhruv Shah 8866039007`; there's no school-branded white-label path. A school paying for a lifetime license still sees developer contact on every lockout. This is fine for 5 schools, unscalable for 50. |
| P-02 | **Offline mode is presented as a feature, but it's a data-integrity risk.** `setStorageMode('offline')` switches the entire app to IndexedDB with no banner. Teachers marking attendance offline see "Saved" but nothing syncs until manual `Verify & Align Cohorts` — no auto-reconciliation, no diff view. |
| P-03 | **Local Wi-Fi Hub requires same subnet but discovery scans 7 subnets × 4 ports with 550ms timeout** (~700 HTTP probes on each `autoDiscoverSchoolPC`). On a congested school router this is a mild DoS; on mobile hotspot it drains battery. Should use mDNS/Bonjour or QR-only. |
| P-04 | **Attendance UX counts Late as Present for rate, but marks Absent for fee/eligibility.** Parents see "Present" badge via Telegram but school sees "Late" for threshold — confusion when eligibility status is `DEFICIENT (<75%)` due to Late half-weight. |
| P-05 | **Fee defaults (`STANDARD_COURSE_FEES`) are opinionated Indian tuition values** (e.g., BCA 45000) hard-coded per `course.level`. Schools on different fee structures must edit source; no admin UI to configure fee policy. |
| P-06 | **Parent portal PIN recovery via WhatsApp to developer** (`LoginPage:608`). Parents locked out must contact the developer, not the school admin — bypasses school autonomy and creates support bottleneck. |
| P-07 | **Master Admin SaaS Fleet lists schools with `isLocked` badge but no audit log.** Lock/unlock is one click with no confirmation beyond browser `confirm()` and no undo trail — accidental lock of a live school during exams has no rollback other than re-unlock. |
| P-08 | **Mobile APK APK is a WebView wrapper, not a native offline app.** All `TeacherAttendancePage` fetches go through `fetch()` to LAN IP — if WebView blocks mixed-content or cleartext HTTP (Android 9+), nothing works and error is "Camera could not be opened". |

---

## 7. Low / Hygiene (but numerous)

| # | File(s) | Issue |
|---|--------|-------|
| LINT-01 | `oxlint` scan | **280 warnings, 0 errors**: `no-unused-vars` (unused imports in Dashboard/Attendance/Batches), `react-perf/jsx-no-new-array-as-prop` (inline arrays in props causing re-renders), `eslint/no-unused-vars` via oxlint-compat. |
| LINT-02 | `src/**/*.js` | **171 `console.*` calls** — `console.warn` in production paths (e.g., `feeService.js:290`, `examService.js:220`) leaks student counts and error messages to browser console. |
| LINT-03 | `src/lib/classHierarchyHelper.js` | `no-useless-escape` in regex for batch code — `\` before `-` inside `[]` is redundant. |
| LINT-04 | Repo | **README is default Vite template** — no setup, no env example, no schema apply instructions. |
| LINT-05 | `android/` + `src-tauri/` | Capacitor and Tauri configs both present but no shared `capacitor.config.ts` env switch — build scripts assume manual `npx cap sync`. |
| LINT-06 | `supabase/schema.sql:960` | **960-line single-file schema with no migrations folder** — `supabase/migrations/` empty. Diffing prod drift impossible. |
| LINT-07 | `package.json:1.0.11` | **Version in package, not in app header** — `SettingsPage` shows `maxCapacity` but not app version; no `__APP_VERSION__` injection via Vite `define`. |
| LINT-08 | Naming | Repo `attendence` (misspelled) vs app `attendance` — search `attendence` misses half the files; inconsistent `parent_students` vs `ParentsPage`. |

---

## 8. What Actually Works Well

- **Offline-first with Local Wi-Fi Hub** is a genuine differentiator for low-connectivity schools. The `localWifiHubService` fallback chain (LAN → Supabase → IndexedDB cache) is thoughtful and the QR pairing UX is polished.
- **Attendance dedup invariant** (`DashboardPage` `Present+Late+Absent+Pending=Total`) is consistently enforced and the `updated_at` authority is correct.
- **Fee installment drift is bounded** (max 1 rupee) and `recordFeePayment` dual-signature is ergonomic for callers.
- **ReportsPage 4-tab dossiers** with print/PDF path (`attendanceExporter.js`) are production-grade; pagination 10/20 is sane.
- **Tauri `__TAURI_INTERNALS__` detection** for `isTauriDesktop()` is correct and the offline `databaseAdapter` Proxy lets the same component code run in both modes.

---

## 9. Recommended Fix Order (first 10 PRs)

1. **PR #1 — Stop shipping secrets:** Move `PRODUCTION_SUPABASE_URL/ANON_KEY` to `VITE_` env, remove hardcoded fallback, rotate Supabase anon key, add `.env.example`. Blocker C-01 + C-05.
2. **PR #2 — Fix auth bypass:** Remove `includes('admin')` / `startsWith('owner')` heuristics; require explicit `user_profiles.role` lookup. Blocker C-02.
3. **PR #3 — Master Admin PIN:** Replace `8866` with env `MASTER_DEV_PIN` (hash with bcrypt), rate-limit `/api/license-manage`, remove `localhost` auto-auth. Blocker C-03.
4. **PR #4 — CORS lockdown:** Replace `*` with allowlist (`vercel.app` + school custom domains), add `OPTIONS` preflight handling. Blocker C-04.
5. **PR #5 — License blob schema:** Introduce `zod` schema for `courses.description`, single `licenseCodec.js` encode/decode, migration to normalize existing rows. A-05.
6. **PR #6 — RLS tightening:** Separate `courses` license rows into dedicated `licenses` table with `service_role`-only write; anon can only `SELECT` where `is_active=true` and `code NOT LIKE 'LIC:%'`. C-06.
7. **PR #7 — Offline auth token:** Replace `"offline-token"` with per-session JWT (HMAC of email + expiry), store expiry, validate on each `getSession()`. H-03.
8. **PR #8 — Split god components:** Extract `useAttendanceReconciliation`, `useFeeSchedule`, `useLicenseGate` hooks; move Dashboard/Reports/Attendance subviews to route-level code-split chunks. A-01.
9. **PR #9 — Remove PII seed:** Move `canonicalSchoolData.js` to `scripts/seed/` not imported by app; empty DB shows empty state, not 101 fake students. A-08.
10. **PR #10 — CI + lint gate:** Add `oxlint --deny-warnings` to CI, remove 171 `console.*` or gate behind `import.meta.env.DEV`, add `supabase/migrations/`. LINT-01/02.

---

## 10. Appendix — Evidence Map

| Claim | Primary evidence |
|-------|-----------------|
| Hardcoded Supabase credentials | `src/lib/supabase.js:12-13`, `src/lib/localWifiHubService.js:14-15` |
| `includes('admin')` bypass | `src/lib/supabase.js:164`, `src/lib/authService.js:32,118` |
| PIN `8866` gate + `x-dev-pin` | `src/pages/MasterAdminPortalPage.jsx:43`, `api/license-manage.js:10,198` |
| Global CORS `*` | `api/license-activate.js:12`, `api/local-hub.js:174` + 5 others (grep) |
| Hardcoded verifier password | `src/lib/licenseService.js:17-21` (bundle-visible) |
| `offline-token` literal | `src/lib/supabase.js:176,210,260` |
| `8866039007` seed bypass | `src/lib/parentPortalService.js:258-259` |
| `memoryAttendanceStore` race | `api/local-hub.js:35-120`, `src/data/attendance_sync.json` |
| Batch code rewrite bug | `src/pages/TeacherAttendancePage.jsx:60-80`, `src/lib/classHierarchyHelper.js` |
| 280 oxlint warnings | `npx oxlint src/ --react-compiler` |
| 171 console.* | `grep -rn "console\." src/ --include="*.js*"` |
| Build fails without node_modules | `npm run build → vite: not found` |
| 7 `phone` copies of developer contact | `grep -rn "8866039007" src/ api/` → 40+ hits in 14 files |

---

*Generated by exhaustive file-by-file audit (372 items scanned, 39k lines, 20-file branch diff, WebRTC/CORS/RLS/license paths traced). No runtime DB was available; Supabase behavior inferred from `schema.sql` + client code.*
