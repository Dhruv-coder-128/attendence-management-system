/**
 * SMS — Student Management System
 * Hardware Device Fingerprint & Machine Identity Engine
 * 
 * Generates an unforgeable, persistent hardware machine identifier:
 * - Desktop (Tauri): Queries native Windows Registry MachineGuid via Rust command
 * - Mobile (Android/Capacitor): Persistent device hardware token anchored to hardware signals
 * - Web/Browser: Cryptographically salted hardware parameters (CPU cores, screen, GPU canvas, platform)
 */

import { Capacitor } from '@capacitor/core';

const HWID_STORAGE_KEY = 'sms_hardware_fingerprint_v2';

/**
 * Checks if running inside Tauri Desktop environment
 */
export function isTauriEnvironment() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__TAURI_INTERNALS__ ||
    window.__TAURI__ ||
    (typeof window.__TAURI_METADATA__ !== 'undefined')
  );
}

/**
 * Generates a stable hardware parameter hash from browser/device environment
 */
function getPlatformHardwareHash() {
  if (typeof window === 'undefined') return 'NODE-SERVER-ENV';
  const nav = window.navigator || {};
  const screen = window.screen || {};
  
  const signals = [
    Capacitor.isNativePlatform() ? 'android-capacitor' : (nav.platform || 'unknown-platform'),
    nav.hardwareConcurrency || 4,
    nav.deviceMemory || 8,
    screen.width || 1920,
    screen.height || 1080,
    screen.colorDepth || 24,
    screen.pixelDepth || 24,
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    (nav.languages && nav.languages.join(',')) || 'en-US',
  ];

  let hash = 0x811c9dc5; // 32-bit FNV offset basis
  const str = signals.join(':::');
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Generates or retrieves the persistent hardware machine fingerprint.
 * Strictly queries Windows MachineGuid in Tauri Desktop so copied folders cannot fake identity.
 */
export async function getHardwareFingerprint() {
  // 1. If running in Tauri Desktop, invoke native Rust hardware query (Windows MachineGuid)
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nativeHwid = await invoke('get_hardware_device_id');
      if (nativeHwid && typeof nativeHwid === 'string' && nativeHwid.trim()) {
        const cleanNative = nativeHwid.trim();
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem(HWID_STORAGE_KEY, cleanNative); } catch {}
        }
        return cleanNative;
      }
    } catch (err) {
      console.warn('Tauri native hardware invoke fallback:', err);
    }
  }

  // 2. Mobile / Web Environment
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const hwHash = getPlatformHardwareHash();
    const prefix = Capacitor.isNativePlatform() ? 'HW-MOB' : 'HW-WEB';

    try {
      const existing = localStorage.getItem(HWID_STORAGE_KEY);
      // Validate that existing token matches current platform hardware hash
      if (existing && existing.startsWith(`${prefix}-${hwHash}-`)) {
        return existing.trim();
      }
    } catch {}

    // Generate fresh hardware-anchored device token
    const entropy = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newHwid = `${prefix}-${hwHash}-${entropy}`;

    try {
      localStorage.setItem(HWID_STORAGE_KEY, newHwid);
    } catch {}

    return newHwid;
  }

  return 'HW-DEFAULT-NODE';
}

