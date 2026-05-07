const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

const isPresent = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const normalizeString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const normalizeTokenKey = (value) => normalizeString(value).trim().toLowerCase();

const formatDateForPlaceholder = (date = new Date()) =>
  date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function extractTemplateTokens(template) {
  const text = normalizeString(template);
  const tokens = new Set();
  let match;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    const key = normalizeTokenKey(match[1]);
    if (key) tokens.add(key);
  }

  return Array.from(tokens);
}

export function buildPrefillContext({
  recipientName = '',
  recipientEmail = '',
  recipientPhone = '',
  companyName = '',
  now = new Date(),
  extra = {},
} = {}) {
  const fullName = normalizeString(recipientName).trim();
  const email = normalizeString(recipientEmail).trim();
  const phone = normalizeString(recipientPhone).trim();
  const company = normalizeString(companyName).trim();

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');
  const fullDate = formatDateForPlaceholder(now);

  const baseContext = {
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email,
    phone,
    company_name: company,
    current_date: fullDate,
    date: fullDate,
    address: '',
    city: '',
    state: '',
    zip: '',
  };

  Object.entries(extra || {}).forEach(([key, value]) => {
    const normalizedKey = normalizeTokenKey(key);
    if (!normalizedKey) return;
    baseContext[normalizedKey] = normalizeString(value).trim();
  });

  return baseContext;
}

export function resolveTemplateText(template, context = {}) {
  const raw = normalizeString(template);
  const tokens = extractTemplateTokens(raw);
  const unresolvedTokens = [];

  TOKEN_PATTERN.lastIndex = 0;
  const value = raw.replace(TOKEN_PATTERN, (_, tokenKey) => {
    const key = normalizeTokenKey(tokenKey);
    const mapped = context[key];
    if (!isPresent(mapped)) {
      unresolvedTokens.push(key);
      return '';
    }
    return normalizeString(mapped);
  });

  return {
    value,
    tokens,
    unresolvedTokens: Array.from(new Set(unresolvedTokens)),
  };
}

export function normalizePrefillPolicy(field = {}) {
  if (field.prefillPolicy === 'locked') return 'locked';
  if (field.prefillPolicy === 'editable') return 'editable';
  return field.readOnly ? 'locked' : 'editable';
}

export function isFieldLocked(field = {}) {
  return normalizePrefillPolicy(field) === 'locked';
}

export function resolveFieldForSend(field = {}, context = {}, options = {}) {
  const policy = normalizePrefillPolicy(field);
  const overrideMap = options.overridesByFieldId || {};

  const hasOverride = Object.prototype.hasOwnProperty.call(overrideMap, field.id);
  const chosenTemplate = hasOverride ? overrideMap[field.id] : field.defaultValue;
  const templateText = normalizeString(chosenTemplate);

  const bindingKey = normalizeTokenKey(field.bindingKey);

  let resolved = resolveTemplateText(templateText, context);
  if (!templateText && bindingKey && isPresent(context[bindingKey])) {
    resolved = {
      value: normalizeString(context[bindingKey]),
      tokens: [],
      unresolvedTokens: [],
    };
  }

  const resolvedValue = resolved.value;
  const hasResolvedValue = isPresent(resolvedValue);
  const readOnly = policy === 'locked' && hasResolvedValue;
  const shouldBlockMissingLockedRequired =
    Boolean(field.required) && policy === 'locked' && !hasResolvedValue;

  return {
    field: {
      ...field,
      defaultValue: resolvedValue,
      readOnly,
      prefillPolicy: policy,
    },
    meta: {
      policy,
      tokens: resolved.tokens,
      unresolvedTokens: resolved.unresolvedTokens,
      hasResolvedValue,
      shouldBlockMissingLockedRequired,
    },
  };
}
