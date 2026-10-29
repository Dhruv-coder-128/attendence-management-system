/**
 * Dynamic support contact resolver.
 * Priority: DB academy_settings.support_contact -> license developerContact -> runtime env defaults.
 */
import { getStoredAcademySettings } from '../lib/academySettings.js';
import runtimeConfig, { DEFAULT_SUPPORT_CONTACT } from './runtimeConfig.js';

export function getSupportContact(licenseContact) {
  // 1. Academy settings (school can customize support info in SettingsPage)
  try {
    const academy = getStoredAcademySettings();
    if (academy?.support_contact?.phone || academy?.support_contact?.email) {
      return {
        name: academy.support_contact.name || academy.academy_name || DEFAULT_SUPPORT_CONTACT.name,
        email: academy.support_contact.email || academy.email || DEFAULT_SUPPORT_CONTACT.email,
        phone: academy.support_contact.phone || academy.phone || DEFAULT_SUPPORT_CONTACT.phone,
        whatsapp: academy.support_contact.whatsapp || academy.support_contact.phone || DEFAULT_SUPPORT_CONTACT.whatsapp,
      };
    }
  } catch {}

  // 2. License embedded contact (for locked-out state where academy settings not loaded)
  if (licenseContact?.phone || licenseContact?.email) {
    return {
      name: licenseContact.name || DEFAULT_SUPPORT_CONTACT.name,
      email: licenseContact.email || DEFAULT_SUPPORT_CONTACT.email,
      phone: licenseContact.phone || DEFAULT_SUPPORT_CONTACT.phone,
      whatsapp: licenseContact.whatsapp || licenseContact.phone || DEFAULT_SUPPORT_CONTACT.whatsapp,
    };
  }

  // 3. Runtime env defaults
  return { ...DEFAULT_SUPPORT_CONTACT };
}

export function getSupportLinks(contact) {
  const c = contact || getSupportContact();
  const phone = (c.phone || '').replace(/[^0-9+]/g, '');
  const email = c.email || '';
  const waRaw = (c.whatsapp || c.phone || '').replace(/[^0-9]/g, '');
  const waNumber = waRaw.length === 10 ? `91${waRaw}` : waRaw;
  const waMessage = encodeURIComponent(
    `Hello ${c.name || 'Support'}, I am using ${runtimeConfig.appName}. I need assistance with my school license.`
  );
  return {
    name: c.name || 'Support',
    email,
    phone: c.phone,
    emailLink: email ? `mailto:${email}?subject=${encodeURIComponent('SMS — School License Assistance')}` : '',
    phoneLink: phone ? `tel:${phone}` : '',
    whatsappLink: waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : '',
  };
}
