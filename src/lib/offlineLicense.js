// Offline licence keys. A key is signed data, so the app can check it without any server.
//
//   The developer's admin tool signs with a PRIVATE key that never leaves the developer's PC.
//   The app only contains the PUBLIC key, so it can check keys but can never create them.
//
// Key bytes (version 1):
//   [0] version  [1] type 0=trial 1=paid  [2-3] issued day  [4-5] expiry day (0xFFFF = lifetime)
//   [6-9] student limit  [10-17] first 8 bytes of SHA-256(device id)  [18-21] random key id
//   [22] name length  [23..] school name (UTF-8)  then 64-byte ECDSA P-256 signature of everything before it.
// Days are counted from 2024-01-01 UTC. Text form: "SMS2-" + Crockford base32 in groups of 5.
// Same code runs in the app (browser / Tauri WebView) and in the admin tool (Node), via Web Crypto.

const VERSION = 1;
const PREFIX = 'SMS2';
const DAY = 86400000;
const EPOCH = Date.UTC(2024, 0, 1);
const LIFETIME = 0xffff;
const SIG_LEN = 64;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' };
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const subtle = () => globalThis.crypto.subtle;
export const dayNumber = (ms) => Math.floor((ms - EPOCH) / DAY);
const dayToMs = (d) => EPOCH + d * DAY;

/** Device ids are compared case-insensitively and without surrounding spaces. */
export const normalizeDeviceId = (id) => String(id || '').trim().toUpperCase();

async function deviceHash(deviceId) {
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(normalizeDeviceId(deviceId)));
  return new Uint8Array(digest).slice(0, 8);
}

function toBase32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text) {
  const clean = text.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
  const out = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

function formatKey(bytes) {
  return `${PREFIX}-${toBase32(bytes).match(/.{1,5}/g).join('-')}`;
}

/** Turns whatever the user pasted (spaces, new lines, lower case, WhatsApp formatting) into bytes. */
function parseKey(text) {
  const t = String(text || '').trim().toUpperCase().replace(/[\s*_~`]/g, '');
  if (!t.startsWith(PREFIX)) return null;
  return fromBase32(t.slice(PREFIX.length));
}

export async function generateSigningKeys() {
  const pair = await subtle().generateKey(ALG, true, ['sign', 'verify']);
  return {
    privateJwk: await subtle().exportKey('jwk', pair.privateKey),
    publicJwk: await subtle().exportKey('jwk', pair.publicKey),
  };
}

/**
 * Creates a signed key. Admin tool only (needs the private key).
 * @param {{schoolName:string, deviceId:string, type:'trial'|'paid', days:number, maxStudents:number}} lic  days >= 9000 = lifetime
 */
export async function signLicense(lic, privateJwk, now = Date.now()) {
  // At most 60 bytes of name; shorten by whole characters so Gujarati/Hindi text is never cut mid-letter.
  let nameText = String(lic.schoolName || '').trim();
  while (new TextEncoder().encode(nameText).length > 60) nameText = [...nameText].slice(0, -1).join('');
  const name = new TextEncoder().encode(nameText);
  const issued = dayNumber(now);
  // +1: expiry is stored as a whole UTC day, so round up and the school always gets at least the full N days.
  const expiry = lic.days >= 9000 ? LIFETIME : issued + Math.max(1, Math.floor(lic.days)) + 1;
  if (expiry !== LIFETIME && expiry >= LIFETIME) throw new Error('Validity is too long.');
  const body = new Uint8Array(23 + name.length);
  const view = new DataView(body.buffer);
  view.setUint8(0, VERSION);
  view.setUint8(1, lic.type === 'paid' ? 1 : 0);
  view.setUint16(2, issued);
  view.setUint16(4, expiry);
  view.setUint32(6, Math.max(1, Math.floor(lic.maxStudents)));
  body.set(await deviceHash(lic.deviceId), 10);
  body.set(globalThis.crypto.getRandomValues(new Uint8Array(4)), 18);
  view.setUint8(22, name.length);
  body.set(name, 23);

  const key = await subtle().importKey('jwk', privateJwk, ALG, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign(SIGN_ALG, key, body));
  const all = new Uint8Array(body.length + SIG_LEN);
  all.set(body);
  all.set(sig, body.length);
  return formatKey(all);
}

/**
 * Checks a key for this computer. Never throws.
 * Returns { ok, reason, license } where reason is one of: invalid, wrong_device, expired, clock.
 * `license` is filled whenever the signature is genuine (even if expired or for another computer).
 */
export async function verifyLicense(text, deviceId, publicJwk, now = Date.now()) {
  try {
    const bytes = parseKey(text);
    if (!bytes || bytes.length < 23 + SIG_LEN || bytes[0] !== VERSION) return { ok: false, reason: 'invalid' };
    const nameLen = bytes[22];
    const bodyLen = 23 + nameLen;
    if (bytes.length < bodyLen + SIG_LEN) return { ok: false, reason: 'invalid' };
    const body = bytes.slice(0, bodyLen);
    const sig = bytes.slice(bodyLen, bodyLen + SIG_LEN);
    const key = await subtle().importKey('jwk', publicJwk, ALG, false, ['verify']);
    if (!(await subtle().verify(SIGN_ALG, key, sig, body))) return { ok: false, reason: 'invalid' };

    const view = new DataView(body.buffer);
    const expiryDay = view.getUint16(4);
    const issuedAt = dayToMs(view.getUint16(2));
    const license = {
      type: view.getUint8(1) === 1 ? 'paid' : 'trial',
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: expiryDay === LIFETIME ? null : new Date(dayToMs(expiryDay)).toISOString(),
      maxStudents: view.getUint32(6),
      keyId: [...body.slice(18, 22)].map((b) => b.toString(16).padStart(2, '0')).join(''),
      schoolName: new TextDecoder().decode(body.slice(23, bodyLen)),
    };

    const expected = await deviceHash(deviceId);
    if (!body.slice(10, 18).every((b, i) => b === expected[i])) return { ok: false, reason: 'wrong_device', license };
    // A computer clock set to before the key was even made means someone wound it back.
    if (now < issuedAt - DAY) return { ok: false, reason: 'clock', license };
    if (license.expiresAt && now >= Date.parse(license.expiresAt)) return { ok: false, reason: 'expired', license };
    return { ok: true, license };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
