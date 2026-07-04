/**
 * Pure helpers for the public (guest) application flow.
 * Extracted verbatim from PublicApplyHandler.jsx — behavior unchanged.
 */

export const getFieldConfig = (applicationConfig, fieldId, defaultRequired = true) => {
  const config = applicationConfig?.[fieldId];
  return {
    hidden: Boolean(config?.hidden),
    required: config !== undefined ? Boolean(config.required) : defaultRequired
  };
};

export const hasUploadedFile = (value) => {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') {
    return Boolean(value.url || value.storagePath || value.name);
  }
  return false;
};

export const AUTO_FILL_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const normalizePostApplicationTemplates = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        const templateId = item.trim();
        if (!templateId) return null;
        return { templateId, title: 'Complete Form', enabled: true };
      }
      if (!item || typeof item !== 'object') return null;
      const templateId = String(item.templateId || item.id || '').trim();
      if (!templateId) return null;
      return {
        templateId,
        title: String(item.title || 'Complete Form').trim(),
        enabled: item.enabled !== false,
      };
    })
    .filter((item) => item && item.enabled !== false);
};

export const parseIsoFromLooseDate = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const mdY = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdY) {
    const m = Number(mdY[1]);
    const d = Number(mdY[2]);
    let y = Number(mdY[3]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const written = new Date(text);
  if (!Number.isNaN(written.getTime())) {
    const y = written.getFullYear();
    const m = written.getMonth() + 1;
    const d = written.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
};

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read file.'));
  reader.readAsDataURL(file);
});

export const buildE2EPublicProfile = (slugValue) => ({
  id: 'e2e-company',
  companyName: 'E2E Logistics',
  appSlug: slugValue || 'e2e-company',
  customQuestions: [],
  applicationConfig: {
    cdlUpload: { hidden: false, required: true },
    medCardUpload: { hidden: false, required: true },
    showEmergencyContacts: false,
  },
  postApplicationTemplates: [
    {
      templateId: 'e2e-post-template',
      title: 'Post-Application Form',
      enabled: true,
    },
  ],
});
