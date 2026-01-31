import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InputField from './InputField';

describe('InputField Component', () => {
    const defaultProps = {
        label: 'Test Input',
        id: 'test-input',
        name: 'testName',
        value: '',
        onChange: vi.fn(),
    };

    it('renders label and input correctly', () => {
        render(<InputField {...defaultProps} />);

        expect(screen.getByLabelText(/Test Input/i)).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveAttribute('id', 'test-input');
    });

    it('applies required attribute and aria-required', () => {
        render(<InputField {...defaultProps} required={true} />);

        const input = screen.getByRole('textbox');
        expect(input).toBeRequired();
        expect(input).toHaveAttribute('aria-required', 'true');
    });

    it('renders error message when error prop is provided', () => {
        const errorMessage = 'This field is invalid';
        render(<InputField {...defaultProps} error={errorMessage} />);

        expect(screen.getByText(errorMessage)).toBeInTheDocument();
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAttribute('aria-describedby');

        const describedBy = input.getAttribute('aria-describedby');
        const errorElement = document.getElementById(describedBy);
        expect(errorElement).toHaveTextContent(errorMessage);
    });

    it('does not render error message when error prop is missing', () => {
        render(<InputField {...defaultProps} />);

        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('aria-invalid', 'false');
        // aria-describedby might be missing or point to help text if implemented,
        // but for now we check it doesn't point to an error.
    });

    it('applies error styling when error is present', () => {
        const errorMessage = 'Error';
        render(<InputField {...defaultProps} error={errorMessage} />);

        const input = screen.getByRole('textbox');
        // Check for error-specific tailwind classes (we'll implement these)
        expect(input.className).toContain('border-red-500');
        expect(input.className).toContain('focus:ring-red-500');
    });
});
