# Licensing (offline) — how it works

No server, no admin panel. Keys are made with one command on the developer's PC and checked inside the app.

## Plans
| Key | App works for |
|---|---|
| 10-day | 10 days (shows a countdown) |
| 30-day | 30 days |
| 180-day | 180 days |
| 365-day | 1 year |

The time starts when you make the key (make it when the school asks, not in advance).
When it runs out, the app locks within 10 seconds and shows **Licence Expired — Contact Developer** with your WhatsApp/phone/email. Their data is kept; a new key unlocks it.

## One-time setup (developer)
1. Your signing key is in `%USERPROFILE%\.sms-admin\signing-key.json`. **Back it up** (USB / private Google Drive).
   Without it you can't make keys that existing EXE builds accept. Never share or commit it.
2. Build the apps: `npm run build:desktop` (EXE) and `npm run build:apk` (teacher phone app).

## Selling to a school
1. School installs the EXE. The activation screen shows a **Device ID** → they send it to you (button: *Send on WhatsApp*).
2. You run: `npm run key -- 30 HW-WIN-XXXX... "School Name"` (use 10, 30, 180 or 365).
3. Send them the printed `SMS2-...` key. They paste it → **Activate**. Works offline.
4. Every key you make is recorded in `%USERPROFILE%\.sms-admin\keys-issued.csv` (opens in Excel).
5. Teacher phones (APK) need no key; they pair with the school PC over Wi-Fi.

Renewal: run the same command again with the same Device ID; they enter the new key on the lock screen.
New computer: they send the new Device ID; make a key for it.

## Limits to know
- A key can't be switched off early; it works until its end date. Give untrusted schools 10 or 30-day keys.
- A key works only on the computer whose Device ID you used. Changing the PC date backwards locks the app.
- The check runs inside the app. It stops fake keys and copying to other PCs, but a skilled person could in theory patch the EXE.
