import { describe, expect, it } from 'vitest';
import {
  buildPrefillContext,
  resolveTemplateText,
  resolveFieldForSend,
  normalizePrefillPolicy,
  isFieldLocked,
} from './prefillEngine';

describe('prefillEngine', () => {
  it('replaces repeated placeholders globally', () => {
    const ctx = buildPrefillContext({
      recipientName: 'Ada Lovelace',
      recipientEmail: 'ada@example.com',
    });

    const resolved = resolveTemplateText(
      '{{full_name}} agrees that {{full_name}} can be contacted at {{email}}.',
      ctx
    );

    expect(resolved.value).toBe('Ada Lovelace agrees that Ada Lovelace can be contacted at ada@example.com.');
    expect(resolved.unresolvedTokens).toEqual([]);
  });

  it('marks locked required fields as blocking when unresolved', () => {
    const field = {
      id: 'driver_name',
      type: 'text',
      label: 'Driver Name',
      required: true,
      prefillPolicy: 'locked',
      defaultValue: '{{full_name}}',
    };

    const resolved = resolveFieldForSend(field, buildPrefillContext());

    expect(resolved.meta.shouldBlockMissingLockedRequired).toBe(true);
    expect(resolved.field.defaultValue).toBe('');
    expect(resolved.field.readOnly).toBe(false);
  });

  it('keeps editable prefilled fields editable', () => {
    const field = {
      id: 'driver_name',
      type: 'text',
      required: true,
      prefillPolicy: 'editable',
      defaultValue: '{{full_name}}',
    };

    const resolved = resolveFieldForSend(
      field,
      buildPrefillContext({ recipientName: 'Ada Lovelace' })
    );

    expect(resolved.field.defaultValue).toBe('Ada Lovelace');
    expect(resolved.field.readOnly).toBe(false);
    expect(resolved.meta.shouldBlockMissingLockedRequired).toBe(false);
  });

  it('supports bindingKey fallback when default template is empty', () => {
    const field = {
      id: 'company_name',
      type: 'text',
      required: false,
      prefillPolicy: 'locked',
      bindingKey: 'company_name',
      defaultValue: '',
    };

    const resolved = resolveFieldForSend(
      field,
      buildPrefillContext({ companyName: 'SafeHaul Logistics' })
    );

    expect(resolved.field.defaultValue).toBe('SafeHaul Logistics');
    expect(resolved.field.readOnly).toBe(true);
  });

  it('normalizes policy from readOnly fallback for legacy fields', () => {
    expect(normalizePrefillPolicy({ readOnly: true })).toBe('locked');
    expect(normalizePrefillPolicy({ readOnly: false })).toBe('editable');
    expect(isFieldLocked({ readOnly: true })).toBe(true);
    expect(isFieldLocked({ readOnly: false })).toBe(false);
  });
});
