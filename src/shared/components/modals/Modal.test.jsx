import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(cleanup);

describe('Modal (C4 accessible dialog)', () => {
    it('exposes dialog semantics with an accessible name', () => {
        render(
            <Modal label="Example dialog" onClose={() => {}}>
                <button>Inside</button>
            </Modal>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAccessibleName('Example dialog');
    });

    it('moves focus into the dialog on open', () => {
        render(
            <Modal label="Focus dialog" onClose={() => {}}>
                <button>First action</button>
                <button>Second action</button>
            </Modal>,
        );
        expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'First action' }),
        );
    });

    it('honours initialFocusRef', () => {
        function Harness() {
            const ref = React.useRef(null);
            return (
                <Modal label="Initial focus" onClose={() => {}} initialFocusRef={ref}>
                    <button>First</button>
                    <button ref={ref}>Preferred</button>
                </Modal>
            );
        }
        render(<Harness />);
        expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'Preferred' }),
        );
    });

    it('restores focus to the previously focused element on close', () => {
        function Harness() {
            const [open, setOpen] = React.useState(false);
            return (
                <div>
                    <button onClick={() => setOpen(true)}>Open</button>
                    {open && (
                        <Modal label="Restore dialog" onClose={() => setOpen(false)}>
                            <button>Close me</button>
                        </Modal>
                    )}
                </div>
            );
        }
        render(<Harness />);
        const opener = screen.getByRole('button', { name: 'Open' });
        opener.focus();
        fireEvent.click(opener);
        // Dialog is open and focused.
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(opener);
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(
            <Modal label="Esc dialog" onClose={onClose}>
                <button>Inside</button>
            </Modal>,
        );
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when closeOnEscape is false', () => {
        const onClose = vi.fn();
        render(
            <Modal label="No esc" onClose={onClose} closeOnEscape={false}>
                <button>Inside</button>
            </Modal>,
        );
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on backdrop click but not on panel click', () => {
        const onClose = vi.fn();
        const { container } = render(
            <Modal label="Backdrop dialog" onClose={onClose}>
                <button>Inside</button>
            </Modal>,
        );
        const overlay = container.firstChild;
        fireEvent.mouseDown(screen.getByRole('dialog'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.mouseDown(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('traps Tab from the last focusable back to the first', () => {
        render(
            <Modal label="Trap dialog" onClose={() => {}}>
                <button>First</button>
                <button>Last</button>
            </Modal>,
        );
        const first = screen.getByRole('button', { name: 'First' });
        const last = screen.getByRole('button', { name: 'Last' });
        last.focus();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
        expect(document.activeElement).toBe(first);
    });

    it('traps Shift+Tab from the first focusable to the last', () => {
        render(
            <Modal label="Trap dialog" onClose={() => {}}>
                <button>First</button>
                <button>Last</button>
            </Modal>,
        );
        const first = screen.getByRole('button', { name: 'First' });
        const last = screen.getByRole('button', { name: 'Last' });
        first.focus();
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);
    });
});
