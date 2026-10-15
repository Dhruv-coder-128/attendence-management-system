#!/usr/bin/env node

/**
 * SMS — Student Management System
 * School Onboarding & Licensing Script (₹0 Cost / Free-Tier Compliant)
 * 
 * Secure Developer CLI tool to provision a new school license and map its dedicated
 * Supabase project database without exposing service-role keys or incurring paid API costs.
 * 
 * Usage:
 *   node scripts/onboard-school.mjs --name "School Name" --url "https://xxx.supabase.co" --anonKey "sb_publishable_..."
 * 
 * Interactive mode:
 *   node scripts/onboard-school.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import readline from 'readline';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\x1b[31m[ERROR]\x1b[0m Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  console.error('The school onboarding script requires privileged access to register the license in the central database.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = value;
    }
  }
  return parsed;
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

function generateLicenseKey(schoolName) {
  const cleanPrefix = (schoolName || 'SMS')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'SCHL';
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SMS-${cleanPrefix}-${randomPart}`;
}

async function main() {
  console.log('\n======================================================');
  console.log(' SMS — Student Management System: School Onboarding');
  console.log(' Server-Controlled 30-Day Trial & Dedicated Database');
  console.log('======================================================\n');

  const args = parseArgs();
  let schoolName = args.name;
  let databaseUrl = args.url;
  let databaseAnonKey = args.anonKey;
  let contactEmail = args.email || '';
  let contactPhone = args.phone || '';

  if (!schoolName || !databaseUrl || !databaseAnonKey) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('Please enter the school onboarding details:\n');
    if (!schoolName) schoolName = await prompt(rl, '1. School / Institution Name: ');
    if (!databaseUrl) databaseUrl = await prompt(rl, '2. School Supabase Project URL (https://<project-ref>.supabase.co): ');
    if (!databaseAnonKey) databaseAnonKey = await prompt(rl, '3. School Supabase Publishable / Anon Key: ');
    if (!contactEmail) contactEmail = await prompt(rl, '4. School Administrator Email (optional): ');
    if (!contactPhone) contactPhone = await prompt(rl, '5. School Contact Phone (optional): ');

    rl.close();
  }

  if (!schoolName || !databaseUrl || !databaseAnonKey) {
    console.error('\n\x1b[31m[ERROR]\x1b[0m School name, database URL, and publishable anon key are required.');
    process.exit(1);
  }

  // Validate database URL format
  if (!databaseUrl.startsWith('https://') || !databaseUrl.includes('.supabase.co')) {
    console.warn('\n\x1b[33m[WARNING]\x1b[0m Database URL does not match typical Supabase format (https://xxx.supabase.co). Proceeding...');
  }

  // Never allow service role key as the client anon key
  if (databaseAnonKey.includes('service_role')) {
    console.error('\n\x1b[31m[SECURITY ERROR]\x1b[0m You provided a SERVICE_ROLE key! Only publishable / anon keys are allowed in client configurations.');
    process.exit(1);
  }

  const licenseKey = args.key || generateLicenseKey(schoolName);

  console.log('\nRegistering school license in central database...');

  const { data, error } = await supabaseAdmin
    .from('school_licenses')
    .insert({
      school_name: schoolName,
      license_key: licenseKey,
      status: 'pending',
      trial_days: 30,
      database_url: databaseUrl.trim(),
      database_anon_key: databaseAnonKey.trim(),
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      developer_notes: `Onboarded via CLI on ${new Date().toISOString()}`,
    })
    .select()
    .single();

  if (error) {
    console.error(`\n\x1b[31m[FAILED]\x1b[0m Database error: ${error.message}`);
    process.exit(1);
  }

  console.log('\n\x1b[32m[SUCCESS]\x1b[0m School license successfully created!');
  console.log('------------------------------------------------------');
  console.log(`School Name:     \x1b[1m${data.school_name}\x1b[0m`);
  console.log(`License Key:     \x1b[32m\x1b[1m${data.license_key}\x1b[0m`);
  console.log(`Database URL:    ${data.database_url}`);
  console.log(`Status:          ${data.status.toUpperCase()} (Activates 30-day trial upon first use)`);
  console.log(`Trial Duration:  ${data.trial_days} Days`);
  console.log('------------------------------------------------------\n');

  console.log('\x1b[36mSchool Delivery Instructions:\x1b[0m');
  console.log('1. Deliver the License Key above to the school administrator.');
  console.log('2. Provide the "SMS — Student Management System" Windows desktop installer (.exe).');
  console.log('3. When they launch SMS, they will be prompted to enter this License Key.');
  console.log('4. The desktop app will automatically connect to their dedicated Supabase database.');
  console.log('5. Their 30-day trial timer will begin on the server immediately upon activation.\n');
}

main().catch((err) => {
  console.error('\nUnexpected error during onboarding:', err);
  process.exit(1);
});
