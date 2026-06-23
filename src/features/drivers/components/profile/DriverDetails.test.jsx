import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DriverDetails } from './DriverDetails';

afterEach(cleanup);

// Regression: endorsements are stored as a comma-separated STRING in most of the
// app, but the view used `endorsements.length > 0 ? endorsements.join(...)`, which
// throws on a string ("H,N".join is not a function) and crashes the whole profile.
describe('DriverDetails endorsements rendering', () => {
    it('renders a string endorsements value without crashing', () => {
        const { getByText } = render(
            <DriverDetails driver={{ licenses: [{ class: 'A', state: 'TX', endorsements: 'H,N' }] }} />,
        );
        expect(getByText('H,N')).toBeInTheDocument();
    });

    it('renders an array endorsements value joined', () => {
        const { getByText } = render(
            <DriverDetails driver={{ licenses: [{ class: 'A', state: 'TX', endorsements: ['H', 'N'] }] }} />,
        );
        expect(getByText('H, N')).toBeInTheDocument();
    });

    it('shows "None" for empty/absent endorsements', () => {
        const { getAllByText } = render(
            <DriverDetails driver={{ licenses: [{ class: 'A', state: 'TX', endorsements: '' }] }} />,
        );
        expect(getAllByText('None').length).toBeGreaterThan(0);
    });

    it('does not crash when the driver has no licenses', () => {
        const { container } = render(<DriverDetails driver={{}} />);
        expect(container).toBeTruthy();
    });
});
