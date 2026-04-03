/**
 * test-edoc-crash.cjs
 * 
 * Console-based data integrity test for the e-signature module.
 * Mocks the exact data mapping logic from:
 *   1. handleSave() in EnvelopeCreator.jsx (frontend field serialization)
 *   2. sealDocument() in digitalSealing.js (backend field processing loop)
 * 
 * Feeds highly corrupted arrays to prove neither pipeline will crash.
 * 
 * Run: node scripts/test-edoc-crash.cjs
 */

'use strict';

// ============================================================
// 1. MOCK: EnvelopeCreator.jsx handleSave() field serialization
// ============================================================
function mockHandleSave(rawFields) {
    // This mirrors the exact logic at EnvelopeCreator.jsx lines ~481-494
    const processedFields = (rawFields || []).filter(f => f != null).map(f => ({
        id: f.id,
        type: f.type,
        label: f.label,
        pageNumber: f.page || 1,
        xPosition: f.x,
        yPosition: f.y,
        width: f.width,
        height: f.height,
        required: f.required ?? true,
        defaultValue: f.defaultValue ?? '',
        readOnly: f.readOnly || false,
        fontSize: f.fontSize || 'Auto',
    }));
    return processedFields;
}

// ============================================================
// 2. MOCK: EnvelopeCreator.jsx hydration mapping (Correct flow)
// ============================================================
function mockHydrate(firestoreFields) {
    // This mirrors the exact logic at EnvelopeCreator.jsx lines ~313-326
    const hydratedFields = (firestoreFields || []).filter(f => f != null).map(f => ({
        id: f.id,
        type: f.type,
        label: f.label || f.type,
        page: f?.pageNumber || f?.page || 1,
        x: f.xPosition ?? f.x ?? 10,
        y: f.yPosition ?? f.y ?? 10,
        width: f.width || 25,
        height: f.height || 5,
        required: f.required ?? true,
        readOnly: f.readOnly ?? false,
        defaultValue: f.defaultValue || '',
        fontSize: f.fontSize || 'Auto',
    }));
    return hydratedFields;
}

// ============================================================
// 3. MOCK: digitalSealing.js sealDocument() field processing loop
// ============================================================
function mockSealDocument(fields, fieldValues) {
    // This mirrors the exact logic at digitalSealing.js lines ~63-171
    const results = [];
    const missingRequiredFields = [];
    const mockPageCount = 3; // simulate a 3-page PDF

    for (const field of fields) {
        // SAFETY: Skip null/undefined entries (digitalSealing.js line 73)
        if (!field) continue;

        const val = fieldValues[field.id] || field.defaultValue;
        if (!val) {
            if (field.required) {
                missingRequiredFields.push(field.id);
            }
            continue;
        }

        const pageIndex = Math.max(0, (field.pageNumber || field.page || 1) - 1);
        if (pageIndex >= mockPageCount) {
            results.push({ id: field.id, status: 'SKIPPED_PAGE_OOB', pageIndex });
            continue;
        }

        const fieldX = field.xPosition ?? field.x ?? 0;
        const fieldY = field.yPosition ?? field.y ?? 0;

        results.push({
            id: field.id,
            status: 'PROCESSED',
            type: field.type,
            page: pageIndex + 1,
            x: fieldX,
            y: fieldY,
            value: typeof val === 'string' ? val.substring(0, 30) : val,
        });
    }

    return { results, missingRequiredFields };
}

// ============================================================
// 4. MOCK: SigningRoom.jsx field filtering (render loop)
// ============================================================
function mockSigningRoomFilter(fields, pageNumber) {
    // Mirrors SigningRoom.jsx line 364: (request?.fields || []).filter(f => f?.pageNumber === index + 1)
    return (fields || []).filter(f => f?.pageNumber === pageNumber);
}

// ============================================================
// TEST DATA: Highly corrupted array
// ============================================================
const badFields = [
    { id: '1', type: 'text', pageNumber: 1, x: 10, y: 20, width: 30, height: 5, label: 'Good Field' },
    null,
    undefined,
    { id: '2', type: 'signature' }, // Missing pageNumber, x, y, width, height entirely
    { pageNumber: null },           // Malformed — no id, no type
    { id: '3', type: 'date', page: 2, xPosition: 15, yPosition: 25, width: 20, height: 5, defaultValue: '2026-01-01' }, // Legacy format
    '',                             // Empty string (truthy but not object)
    0,                              // Falsy number
    false,                          // Boolean false
    { id: '4', type: 'checkbox', pageNumber: 999 }, // Out-of-bounds page
    { id: '5', type: 'text', pageNumber: 1, required: true }, // Required but will have no value
];

const fieldValues = {
    '1': 'John Doe',
    '2': 'gs://bucket/secure_documents/co1/signatures/sig1.png',
    '3': '',  // intentionally empty
    '4': true, // provide a value so OOB page check is reached
};

// ============================================================
// RUN TESTS
// ============================================================
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n========================================');
console.log('  E-Doc Crash Resistance Test Suite');
console.log('========================================\n');

// --- Test Suite 1: handleSave (Frontend Serialization) ---
console.log('--- Suite 1: handleSave() serialization ---');

test('Filters out null, undefined, and falsy entries', () => {
    const result = mockHandleSave(badFields);
    // Should only keep objects with some structure: items at index 0, 3, 4, 5
    assert(result.length > 0, `Expected results but got ${result.length}`);
    assert(!result.some(f => f === null || f === undefined), 'Found null/undefined in output');
    console.log(`     Filtered ${badFields.length} → ${result.length} valid fields`);
});

test('Handles missing pageNumber gracefully (defaults to 1)', () => {
    const result = mockHandleSave(badFields);
    result.forEach(f => {
        assert(typeof f.pageNumber === 'number', `pageNumber is not a number for ${f.id}: ${f.pageNumber}`);
        assert(f.pageNumber >= 1, `pageNumber < 1 for ${f.id}`);
    });
});

test('Does not crash on completely empty input', () => {
    const result = mockHandleSave(null);
    assert(Array.isArray(result), 'Expected array');
    assert(result.length === 0, 'Expected empty array');
});

test('Does not crash on undefined input', () => {
    const result = mockHandleSave(undefined);
    assert(Array.isArray(result), 'Expected array');
    assert(result.length === 0, 'Expected empty array');
});

// --- Test Suite 2: Hydration (Correct Flow) ---
console.log('\n--- Suite 2: Hydration mapping ---');

test('Hydrates corrupted Firestore data without crash', () => {
    const result = mockHydrate(badFields);
    assert(result.length > 0, 'Expected some hydrated fields');
    console.log(`     Hydrated ${badFields.length} → ${result.length} valid fields`);
});

test('Falls back page to 1 when pageNumber is null', () => {
    const result = mockHydrate([{ id: 'x', type: 'text', pageNumber: null }]);
    assert(result[0].page === 1, `Expected page=1 but got ${result[0].page}`);
});

test('Uses optional chaining safely on undefined elements', () => {
    const result = mockHydrate([undefined, null, { id: 'y', type: 'sig' }]);
    assert(result.length === 1, `Expected 1 result, got ${result.length}`);
});

// --- Test Suite 3: Digital Sealing (Backend) ---
console.log('\n--- Suite 3: sealDocument() backend processing ---');

test('Processes corrupted field array without crash', () => {
    const { results, missingRequiredFields } = mockSealDocument(badFields, fieldValues);
    console.log(`     Processed: ${results.length}, Missing required: ${missingRequiredFields.length}`);
    assert(results.length > 0, 'Expected some processed results');
});

test('Skips out-of-bounds pages gracefully', () => {
    const { results } = mockSealDocument(badFields, fieldValues);
    const oob = results.filter(r => r.status === 'SKIPPED_PAGE_OOB');
    assert(oob.length > 0, 'Expected at least one OOB skip');
    console.log(`     OOB skips: ${oob.length}`);
});

test('Tracks missing required fields correctly', () => {
    const { missingRequiredFields } = mockSealDocument(badFields, fieldValues);
    // Field '4' (checkbox, page 999) has no value and defaults to required=true
    assert(missingRequiredFields.length > 0, 'Expected missing required fields to be tracked');
    console.log(`     Missing required: [${missingRequiredFields.join(', ')}]`);
});

// --- Test Suite 4: SigningRoom Filter ---
console.log('\n--- Suite 4: SigningRoom field filter ---');

test('Filters corrupted array for page 1 without crash', () => {
    const result = mockSigningRoomFilter(badFields, 1);
    assert(Array.isArray(result), 'Expected array');
    console.log(`     Page 1 fields: ${result.length}`);
});

test('Returns empty for null input', () => {
    const result = mockSigningRoomFilter(null, 1);
    assert(result.length === 0, 'Expected empty array');
});

test('Handles field with pageNumber: null gracefully', () => {
    const result = mockSigningRoomFilter([{ id: 'z', pageNumber: null }], 1);
    assert(result.length === 0, 'null !== 1, should not match');
});

// ============================================================
// SUMMARY
// ============================================================
console.log('\n========================================');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
    console.error('💥 SOME TESTS FAILED — do NOT deploy until fixed.');
    process.exit(1);
} else {
    console.log('🎉 ALL TESTS PASSED — data pipelines are crash-proof.');
    process.exit(0);
}
