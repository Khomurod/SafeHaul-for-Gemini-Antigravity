/**
 * Contract freeze for the VOE preview and its export pipeline.
 *
 * Written BEFORE the design-system migration. `VOEPreviewModal` had **no test
 * coverage at all** while owning a generated legal document, an html2canvas →
 * jsPDF export, a print-window pipeline, SSN masking, signature rules and an
 * audit identifier. Everything asserted here is asserted by value, so the
 * migration is provably behaviour-preserving.
 *
 * The generated document is treated as immutable document content, not
 * themeable app chrome: `VOEPreviewModal.export.test.jsx` pins that separately.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

const dataMock = vi.hoisted(() => ({ value: { currentCompanyProfile: { name: 'Northwind Carriers' } } }));
const h2cMock = vi.hoisted(() => ({ fn: vi.fn() }));
const pdfMock = vi.hoisted(() => ({
  ctor: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
}));

const sanitizeSpy = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('@/context/DataContext', () => ({ useData: () => dataMock.value }));
vi.mock('@shared/utils/sanitizeUserContent', async (importOriginal) => {
  const actual = await importOriginal();
  sanitizeSpy.fn = vi.fn(actual.sanitizeUserContent);
  return { ...actual, sanitizeUserContent: (...args) => sanitizeSpy.fn(...args) };
});
vi.mock('html2canvas', () => ({ default: (...args) => h2cMock.fn(...args) }));
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opts) {
      pdfMock.ctor(opts);
      this.addImage = pdfMock.addImage;
      this.save = pdfMock.save;
    }
  },
}));

import { VOEPreviewModal } from './VOEPreviewModal';

const EMPLOYER = {
  companyName: 'Acme Freight',
  city: 'Austin',
  state: 'TX',
  startDate: '2020-01',
  endDate: '2022-06',
  email: 'hr@acme.test',
  phone: '512-555-0100',
};

const APPLICANT = {
  id: 'app-abc123',
  firstName: 'Maria',
  lastName: 'Garcia',
  ssn: '123-45-6789',
  dob: '1990-04-02',
  signature: 'data:image/png;base64,AAAA',
  'signature-date': '07/01/2026',
  ipAddress: '203.0.113.7',
};

const renderModal = (props = {}) => {
  const onClose = props.onClose || vi.fn();
  const onSend = props.onSend || vi.fn();
  const utils = render(
    <VOEPreviewModal
      employer={props.employer === undefined ? EMPLOYER : props.employer}
      applicant={props.applicant === undefined ? APPLICANT : props.applicant}
      onClose={onClose}
      onSend={onSend}
    />,
  );
  return { ...utils, onClose, onSend };
};

/** The generated document node — the thing that gets printed and exported. */
const documentNode = () => screen.getByTestId('voe-document');

beforeEach(() => {
  vi.clearAllMocks();
  dataMock.value = { currentCompanyProfile: { name: 'Northwind Carriers' } };
});

afterEach(cleanup);

describe('VOEPreviewModal missing data', () => {
  it('renders no document without an employer', () => {
    renderModal({ employer: null });
    expect(screen.queryByTestId('voe-document')).toBeNull();
  });

  it('renders no document without an applicant', () => {
    renderModal({ applicant: null });
    expect(screen.queryByTestId('voe-document')).toBeNull();
  });
});

describe('VOEPreviewModal legal text and ordering', () => {
  it('keeps the regulatory preamble verbatim', () => {
    renderModal();
    expect(documentNode()).toHaveTextContent(
      /This request is made pursuant to the Federal Motor Carrier Safety Regulations \(FMCSR\) 49 CFR Part 391\.23\.\s+This regulation requires prospective employers to investigate a driver's background through the driver's previous employers\./,
    );
  });

  it('keeps the release and authorization paragraph verbatim, including both citations', () => {
    renderModal();
    const doc = documentNode();
    expect(doc).toHaveTextContent(
      /I, the undersigned applicant, hereby provide specific written consent and authorize the release of all information requested by SafeHaul HR Verification Services on behalf of the prospective employer\./,
    );
    expect(doc).toHaveTextContent(/49 CFR §391\.23/);
    expect(doc).toHaveTextContent(/§40\.321/);
    expect(doc).toHaveTextContent(
      /I release all previous employers and their agents from any and all liability which may result from furnishing such information in good faith\./,
    );
  });

  it('keeps the document section order', () => {
    renderModal();
    const text = documentNode().textContent;
    const order = [
      'SAFEHAUL',
      'Compliance & Verification Services',
      'VOE-391.23',
      'Request for Verification of Employment',
      'To (Previous Employer)',
      'From (Prospective Employer)',
      'Subject Applicant Information',
      'Legal Release & Authorization',
      'Digital Signature of Applicant',
      'Date of Authorization',
      'Employment History Questionnaire (To be completed by Recipient)',
      'Safety Performance (Accidents)',
      'Drug & Alcohol Compliance (Part 40)',
      'Protected by SafeHaul Encryption Services',
    ];
    let cursor = -1;
    for (const fragment of order) {
      const at = text.indexOf(fragment);
      expect(at, `"${fragment}" missing from the generated document`).toBeGreaterThan(-1);
      expect(at, `"${fragment}" is out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('keeps the three Part 40 questions in their exact wording and order', () => {
    renderModal();
    const text = documentNode().textContent;
    const questions = [
      'Did the driver refuse to take a required drug or alcohol test?',
      'Did the driver have any other drug/alcohol regulation violations?',
      'Did the driver test positive for a controlled substance?',
    ];
    let cursor = text.indexOf('Drug & Alcohol Compliance (Part 40)');
    for (const q of questions) {
      const at = text.indexOf(q);
      expect(at, `"${q}" missing`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('keeps the basic verification questions', () => {
    renderModal();
    const text = documentNode().textContent;
    [
      'Did this person work for you?',
      'Dates of employment correct?',
      'Type of equipment operated:',
      'Eligible for re-hire?',
      'Did the driver have any DOT-recordable accidents?',
    ].forEach((q) => expect(text).toContain(q));
  });
});

describe('VOEPreviewModal field values and fallbacks', () => {
  it('shows the employer, applicant and service dates', () => {
    renderModal();
    const doc = documentNode();
    expect(doc).toHaveTextContent('Acme Freight');
    expect(doc).toHaveTextContent('Austin, TX');
    expect(doc).toHaveTextContent('hr@acme.test');
    expect(doc).toHaveTextContent('512-555-0100');
    expect(doc).toHaveTextContent('Maria Garcia');
    expect(doc).toHaveTextContent('2020-01 to 2022-06');
  });

  it('falls back from employer companyName to name', () => {
    renderModal({ employer: { ...EMPLOYER, companyName: undefined, name: 'Legacy Hauling' } });
    expect(documentNode()).toHaveTextContent('Legacy Hauling');
  });

  it('uses the getFieldValue "Not Specified" fallback for absent values', () => {
    renderModal({ employer: { companyName: 'Acme Freight' } });
    expect(documentNode()).toHaveTextContent('Not Specified');
  });

  it('omits employer email and phone lines when absent', () => {
    renderModal({ employer: { ...EMPLOYER, email: undefined, phone: undefined } });
    const doc = documentNode();
    expect(doc).not.toHaveTextContent('hr@acme.test');
    expect(doc).not.toHaveTextContent('512-555-0100');
  });

  it('names the prospective employer from the company profile', () => {
    renderModal();
    expect(documentNode()).toHaveTextContent('Northwind Carriers');
  });

  it('falls back through companyName to the [PROSPECTIVE COMPANY] placeholder', () => {
    dataMock.value = { currentCompanyProfile: { companyName: 'Fallback Freight' } };
    renderModal();
    expect(documentNode()).toHaveTextContent('Fallback Freight');
    cleanup();

    dataMock.value = { currentCompanyProfile: null };
    renderModal();
    expect(documentNode()).toHaveTextContent('[PROSPECTIVE COMPANY]');
  });

  it('keeps the date-of-birth NOT DISCLOSED fallback', () => {
    renderModal({ applicant: { ...APPLICANT, dob: undefined } });
    expect(documentNode()).toHaveTextContent('NOT DISCLOSED');
  });

  it('keeps the IP attestation and its Verified fallback', () => {
    renderModal();
    expect(documentNode()).toHaveTextContent('203.0.113.7');
    cleanup();

    renderModal({ applicant: { ...APPLICANT, ipAddress: undefined } });
    expect(documentNode()).toHaveTextContent(/IP:\s*Verified/);
  });
});

describe('VOEPreviewModal SSN masking', () => {
  it('shows only the last four digits', () => {
    renderModal();
    const doc = documentNode();
    expect(doc).toHaveTextContent('***-**-6789');
    expect(doc).not.toHaveTextContent('123-45-6789');
  });

  it('redacts entirely when there is no SSN on file', () => {
    renderModal({ applicant: { ...APPLICANT, ssn: undefined } });
    expect(documentNode()).toHaveTextContent('REDACTED (ON FILE)');
  });
});

describe('VOEPreviewModal signature rules', () => {
  it('renders an image signature from a non-TEXT_SIGNATURE value', () => {
    renderModal();
    expect(within(documentNode()).getByAltText('Signature'))
      .toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('renders a typed signature with the /s/ prefix and no image', () => {
    renderModal({ applicant: { ...APPLICANT, signature: 'TEXT_SIGNATURE:Maria Garcia' } });
    const doc = documentNode();
    expect(doc).toHaveTextContent('/s/ Maria Garcia');
    expect(within(doc).queryByAltText('Signature')).toBeNull();
  });

  it('shows the missing-signature notice when there is no signature', () => {
    renderModal({ applicant: { ...APPLICANT, signature: undefined } });
    const doc = documentNode();
    expect(doc).toHaveTextContent('DRIVER SIGNATURE MISSING');
    expect(doc).toHaveTextContent('Application must be signed before transmission');
  });

  it('keeps the authorization date and its today fallback', () => {
    renderModal();
    expect(documentNode()).toHaveTextContent('07/01/2026');
    cleanup();

    renderModal({ applicant: { ...APPLICANT, 'signature-date': undefined } });
    expect(documentNode()).toHaveTextContent(new Date().toLocaleDateString());
  });

  it('keeps the 30-day validity note', () => {
    renderModal();
    expect(documentNode()).toHaveTextContent('Valid for 30 Days');
  });
});

describe('VOEPreviewModal audit identifier', () => {
  const auditIdFrom = (doc) => doc.textContent.match(/Secure Audit ID:\s*([A-Z0-9-]+)/)[1];

  it('derives a stable id from the applicant id', () => {
    const { rerender } = renderModal();
    const first = auditIdFrom(documentNode());

    rerender(
      <VOEPreviewModal employer={EMPLOYER} applicant={APPLICANT} onClose={vi.fn()} onSend={vi.fn()} />,
    );
    expect(auditIdFrom(documentNode())).toBe(first);
  });

  it('uses the exact derivation: last six of the base, upper-cased, plus a base-36 char-code sum', () => {
    renderModal();
    const base = 'app-abc123';
    const expected = base.slice(-6).toUpperCase() + '-'
      + Math.abs(base.split('').reduce((a, c) => a + c.charCodeAt(0), 0)).toString(36).toUpperCase().slice(0, 6);
    expect(auditIdFrom(documentNode())).toBe(expected);
  });

  it('falls back to uid when there is no id', () => {
    renderModal({ applicant: { ...APPLICANT, id: undefined, uid: 'uid-xyz789' } });
    const base = 'uid-xyz789';
    const expected = base.slice(-6).toUpperCase() + '-'
      + Math.abs(base.split('').reduce((a, c) => a + c.charCodeAt(0), 0)).toString(36).toUpperCase().slice(0, 6);
    expect(auditIdFrom(documentNode())).toBe(expected);
  });
});

describe('VOEPreviewModal PDF export', () => {
  beforeEach(() => {
    h2cMock.fn.mockResolvedValue({
      width: 816,
      height: 1056,
      toDataURL: () => 'data:image/png;base64,PDFIMAGE',
    });
  });

  it('captures the document node with the frozen html2canvas options', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    await waitFor(() => expect(h2cMock.fn).toHaveBeenCalled());
    const [node, options] = h2cMock.fn.mock.calls[0];
    expect(node).toBe(documentNode());
    expect(options).toEqual({ scale: 2, useCORS: true });
  });

  it('builds the pdf at the captured canvas dimensions in px', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    await waitFor(() => expect(pdfMock.ctor).toHaveBeenCalled());
    expect(pdfMock.ctor).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'px',
      format: [816, 1056],
    });
    expect(pdfMock.addImage).toHaveBeenCalledWith('data:image/png;base64,PDFIMAGE', 'PNG', 0, 0, 816, 1056);
  });

  it('saves with the frozen filename, underscoring whitespace', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    await waitFor(() => expect(pdfMock.save).toHaveBeenCalledWith('VOE_Acme_Freight_Maria_Garcia.pdf'));
  });

  it('falls back to Employer in the filename when the employer has no companyName', async () => {
    renderModal({ employer: { ...EMPLOYER, companyName: undefined } });
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    await waitFor(() => expect(pdfMock.save).toHaveBeenCalledWith('VOE_Employer_Maria_Garcia.pdf'));
  });

  it('reports a generation failure and recovers the control', async () => {
    h2cMock.fn.mockRejectedValue(new Error('canvas exploded'));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));

    await waitFor(() => expect(screen.getByRole('alert'))
      .toHaveTextContent('Failed to generate PDF. Please try again.'));
    expect(pdfMock.save).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /Download PDF/i })).toBeEnabled());
  });
});

describe('VOEPreviewModal print pipeline', () => {
  it('opens the print window with the frozen features and writes the sanitised document', () => {
    const printWindow = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };
    const openSpy = vi.fn(() => printWindow);
    vi.stubGlobal('open', openSpy);
    vi.useFakeTimers();

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^Print$/i }));

    expect(openSpy).toHaveBeenCalledWith(
      '',
      '',
      'left=0,top=0,width=800,height=900,toolbar=0,scrollbars=0,status=0',
    );

    const written = printWindow.document.write.mock.calls.map((c) => c[0]);
    expect(written[0]).toBe('<html><head><title>Print VOE</title>');
    expect(written[1]).toBe('<script src="https://cdn.tailwindcss.com"></script>');
    expect(written[2]).toBe('</head><body>');
    expect(written[3]).toMatch(/^<div style="padding: 20px;">/);
    expect(written[4]).toBe('</body></html>');
    expect(printWindow.document.close).toHaveBeenCalled();
    expect(printWindow.focus).toHaveBeenCalled();

    // Print and close are deferred by exactly one second.
    expect(printWindow.print).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(printWindow.print).toHaveBeenCalled();
    expect(printWindow.close).toHaveBeenCalled();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('passes the document markup through the shared sanitiser before writing it', () => {
    const printWindow = {
      document: { write: vi.fn(), close: vi.fn() },
      focus: vi.fn(), print: vi.fn(), close: vi.fn(),
    };
    vi.stubGlobal('open', vi.fn(() => printWindow));
    vi.useFakeTimers();

    renderModal();
    const innerHTML = documentNode().innerHTML;
    fireEvent.click(screen.getByRole('button', { name: /^Print$/i }));

    // The contract is the *pipeline*: the document node's own innerHTML is
    // handed to `sanitizeUserContent`, and whatever it returns is what gets
    // written inside the 20 px padding wrapper. Deliberately NOT asserting
    // DOMPurify's own allowlist behaviour — that is the shared utility's
    // contract (and its output differs between happy-dom and a real browser,
    // which is recorded as a finding in the roadmap rather than pinned here).
    expect(sanitizeSpy.fn).toHaveBeenCalledWith(innerHTML);

    const body = printWindow.document.write.mock.calls[3][0];
    expect(body).toBe(`<div style="padding: 20px;">${sanitizeSpy.fn.mock.results[0].value}</div>`);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe('VOEPreviewModal callbacks', () => {
  it('returns to the request modal from the header close', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns to the request modal from Edit Request', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Request' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('transmits with no arguments when a signature is present', () => {
    const { onSend } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Transmit Request Now/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith();
  });

  it('accepts a typed signature for transmission', () => {
    const { onSend } = renderModal({ applicant: { ...APPLICANT, signature: 'TEXT_SIGNATURE:Maria Garcia' } });
    fireEvent.click(screen.getByRole('button', { name: /Transmit Request Now/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('blocks transmission without a signature', () => {
    const { onSend } = renderModal({ applicant: { ...APPLICANT, signature: undefined } });
    const transmit = screen.getByRole('button', { name: /Transmit Request Now/i });

    expect(transmit).toBeDisabled();
    fireEvent.click(transmit);
    expect(onSend).not.toHaveBeenCalled();
  });
});
