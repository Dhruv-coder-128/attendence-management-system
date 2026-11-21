# Licensing (offline) — how it works

No server, no admin panel. Keys are made with one command on the developer's PC and checked inside the app.
A key is locked to **one computer** (its Device ID), has an **end date**, and carries the **student limit** (plan size).

## Plans
| Key length | App works for | |
|---|---|---|
| 10 days | 10 days | trial (shows a countdown in the movable pill) |
| 30 / 180 / 365 days | that long | paid |

| Student plan | `--students` | Limit |
|---|---|---|
| Starter | `200` (default) | 200 students |
| Growth | `500` | 500 students |
| Pro | `1000` | 1000 students |
| Enterprise | `5000` | unlimited |

The default is the smallest plan, so a forgotten flag never gives away more than 200 students.
At the limit the app refuses to add more students (one by one or by Excel import) and tells the school to contact you; existing data is untouched.
When the key's end date passes, the app locks and shows **Licence Expired — Contact Developer**; data is kept and a new key unlocks it.

## New school
1. School installs the EXE. The activation screen shows a **Device ID** → they send it (button: *Send on WhatsApp*).
2. You run:
   ```
   npm run key -- 30 HW-WIN-XXXX... "School Name" --students 500
   ```
3. Send the printed `SMS2-...` key. They paste it → **Activate**. Works offline.
4. Teacher phones (APK) need no key; they pair with the school PC over Wi-Fi.

## Renew or upgrade (trial → full year, 200 → 500 students, …) — no data is ever lost
```
npm run key -- renew "School Name" 365 --students 500
```
- Finds the school's computer from your records (`keys-issued.csv`), so you don't need the Device ID again.
- Keeps the previous student plan unless you pass `--students`.
- Adds the unused days of a **paid** key (a 10-day trial never carries over).  `--no-carry` turns that off.
- School changed computer? `npm run key -- renew "School Name" 365 --device HW-WIN-NEW...`
- The school enters the new key on the lock screen or in Settings → their students, fees and attendance stay exactly as they were.

## See all schools
```
npm run key -- list
```
Shows each school's latest key: length, student plan, end date, and "ends in 5d - renew soon" / "EXPIRED".

## Keep safe (in `%USERPROFILE%\.sms-admin`, never in git)
- `signing-key.json` — signs licence keys. Without it existing apps reject new keys. **Back it up.**
- `keys-issued.csv` — your record of every key (opens in Excel).

## Limits to know
- A key can't be switched off before its end date. Give new or unsure schools 10 or 30 days.
- The check runs inside the app. It stops fake keys and copying to other PCs, but a skilled person could patch the EXE.
