// Focused coverage for the placed-field overlay. The drag/resize mathematics is
// this component's real contract — every percentage conversion, bound, floor and
// callback payload is pinned here so the migration cannot move a field by a
// pixel. All fixtures are artificial.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-draggable is replaced with a transparent harness that records the props
// it was given and lets a test invoke onStop with a chosen pixel position, so
// the conversion maths can be asserted without a real pointer gesture.
const draggableProps = vi.hoisted(() => ({ current: null }));
vi.mock('react-draggable', () => ({
    default: ({ children, ...props }) => {
        draggableProps.current = props;
        return React.cloneElement(children, { 'data-draggable': 'true' });
    },
}));

import { ResizableDraggableField } from './ResizableDraggableField';

const PAGE_WIDTH = 800;
const PAGE_HEIGHT = 1000;

function icon(type) {
    return <span data-testid={`icon-${type}`} />;
}

let handlers;

function makeField(overrides = {}) {
    return {
        id: 'f-1',
        type: 'text',
        label: 'Full Name',
        page: 1,
        x: 10,
        y: 20,
        width: 25,
        height: 5,
        ...overrides,
    };
}

function renderField(fieldOverrides = {}, propOverrides = {}) {
    const field = makeField(fieldOverrides);
    const utils = render(
        <ResizableDraggableField
            field={field}
            pageNum={1}
            pageWidth={PAGE_WIDTH}
            pageHeight={PAGE_HEIGHT}
            getIcon={icon}
            isSelected={false}
            {...handlers}
            {...propOverrides}
        />,
    );
    return { field, ...utils };
}

/** Simulates a full resize gesture through the window-level listeners. */
function resizeBy(container, dx, dy) {
    const handle = container.querySelector('.resize-handle');
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
    fireEvent(window, new MouseEvent('mousemove', { clientX: 100 + dx, clientY: 100 + dy }));
    fireEvent(window, new MouseEvent('mouseup', {}));
}

beforeEach(() => {
    draggableProps.current = null;
    handlers = {
        onStop: vi.fn(),
        onResize: vi.fn(),
        onRemove: vi.fn(),
        onLabelChange: vi.fn(),
        onSelect: vi.fn(),
    };
});

describe('ResizableDraggableField — geometry', () => {
    it('converts percentage position to pixels for the drag position', () => {
        renderField({ x: 10, y: 20 });
        expect(draggableProps.current.position).toEqual({ x: 80, y: 200 });
    });

    it('converts percentage size to pixels for the rendered box', () => {
        const { container } = renderField({ width: 25, height: 5 });
        const box = container.querySelector('[data-draggable]');
        expect(box).toHaveStyle({ width: '200px', height: '50px' });
    });

    it('falls back to a 800px page height when none is supplied', () => {
        renderField({ y: 50, height: 10 }, { pageHeight: undefined });
        // 50% of the 800px fallback, not of the real page.
        expect(draggableProps.current.position).toEqual({ x: 80, y: 400 });
    });

    it('treats a zero page height as absent', () => {
        renderField({ y: 50 }, { pageHeight: 0 });
        expect(draggableProps.current.position.y).toBe(400);
    });

    it('re-syncs the box when the field size prop changes', () => {
        const { container, rerender } = renderField({ width: 25, height: 5 });
        rerender(
            <ResizableDraggableField
                field={makeField({ width: 50, height: 10 })}
                pageNum={1}
                pageWidth={PAGE_WIDTH}
                pageHeight={PAGE_HEIGHT}
                getIcon={icon}
                isSelected={false}
                {...handlers}
            />,
        );
        expect(container.querySelector('[data-draggable]')).toHaveStyle({ width: '400px', height: '100px' });
    });
});

describe('ResizableDraggableField — drag contract', () => {
    it('constrains dragging to the page and cancels on the handle and label', () => {
        renderField();
        expect(draggableProps.current.bounds).toBe('parent');
        expect(draggableProps.current.cancel).toBe('.resize-handle, .label-input');
    });

    it('reports the drop position back as percentages of the page', () => {
        renderField();
        draggableProps.current.onStop({}, { x: 400, y: 500 });
        expect(handlers.onStop).toHaveBeenCalledTimes(1);
        expect(handlers.onStop).toHaveBeenCalledWith('f-1', 1, 50, 50);
    });

    it('uses the page-height fallback in the drop conversion too', () => {
        renderField({}, { pageHeight: undefined });
        draggableProps.current.onStop({}, { x: 200, y: 400 });
        expect(handlers.onStop).toHaveBeenCalledWith('f-1', 1, 25, 50);
    });

    it('reports the page it was dropped on', () => {
        renderField({}, { pageNum: 3 });
        draggableProps.current.onStop({}, { x: 0, y: 0 });
        expect(handlers.onStop).toHaveBeenCalledWith('f-1', 3, 0, 0);
    });
});

describe('ResizableDraggableField — resize contract', () => {
    it('reports the new size as percentages after a drag of the handle', () => {
        const { container } = renderField({ width: 25, height: 5 });
        // 200x50 px + 200x50 px = 400x100 px → 50% x 10%.
        resizeBy(container, 200, 50);
        expect(handlers.onResize).toHaveBeenCalledTimes(1);
        expect(handlers.onResize).toHaveBeenCalledWith('f-1', 50, 10);
    });

    it('enforces the 8px minimum in both dimensions', () => {
        const { container } = renderField({ width: 25, height: 5 });
        resizeBy(container, -1000, -1000);
        expect(handlers.onResize).toHaveBeenCalledWith('f-1', (8 / PAGE_WIDTH) * 100, (8 / PAGE_HEIGHT) * 100);
    });

    it('grows the rendered box live while dragging', () => {
        const { container } = renderField({ width: 25, height: 5 });
        const handle = container.querySelector('.resize-handle');
        fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
        fireEvent(window, new MouseEvent('mousemove', { clientX: 100, clientY: 20 }));
        expect(container.querySelector('[data-draggable]')).toHaveStyle({ width: '300px', height: '70px' });
        fireEvent(window, new MouseEvent('mouseup', {}));
    });

    it('stops tracking the pointer after the gesture ends', () => {
        const { container } = renderField();
        resizeBy(container, 100, 100);
        handlers.onResize.mockClear();

        // A stray move after mouseup must not resize anything further.
        fireEvent(window, new MouseEvent('mousemove', { clientX: 999, clientY: 999 }));
        fireEvent(window, new MouseEvent('mouseup', {}));
        expect(handlers.onResize).not.toHaveBeenCalled();
    });

    it('uses the page-height fallback in the resize conversion', () => {
        const { container } = renderField({ width: 25, height: 5 }, { pageHeight: undefined });
        resizeBy(container, 0, 0);
        // Height starts at 5% of the 800px fallback = 40px → back to 5%.
        expect(handlers.onResize).toHaveBeenCalledWith('f-1', 25, 5);
    });
});

describe('ResizableDraggableField — selection, label and removal', () => {
    it('selects by id and does not let the click reach the page', () => {
        const { container } = renderField();
        const box = container.querySelector('[data-draggable]');
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');
        box.dispatchEvent(clickEvent);

        expect(handlers.onSelect).toHaveBeenCalledWith('f-1');
        expect(stopPropagation).toHaveBeenCalled();
    });

    it('shows a selection ring only when selected', () => {
        const { container, rerender } = renderField();
        expect(container.querySelector('[data-draggable]').className).not.toContain('ring-2');

        rerender(
            <ResizableDraggableField
                field={makeField()}
                pageNum={1}
                pageWidth={PAGE_WIDTH}
                pageHeight={PAGE_HEIGHT}
                getIcon={icon}
                isSelected
                {...handlers}
            />,
        );
        expect(container.querySelector('[data-draggable]').className).toContain('ring-2');
    });

    it('edits the label by id with the raw value', () => {
        renderField();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Signer Name' } });
        expect(handlers.onLabelChange).toHaveBeenCalledWith('f-1', 'Signer Name');
    });

    it('hides the label input at or below the 40px width threshold', () => {
        const { container } = renderField({ width: 5 }); // 40px exactly
        expect(container.querySelector('.label-input')).toBeNull();
    });

    it('shows the label input above the 40px threshold', () => {
        const { container } = renderField({ width: 6 }); // 48px
        expect(container.querySelector('.label-input')).not.toBeNull();
    });

    it('removes by id on mousedown so the drag never starts', () => {
        renderField();
        const remove = screen.getByRole('button', { name: 'Remove Full Name from page 1' });
        fireEvent.mouseDown(remove);
        expect(handlers.onRemove).toHaveBeenCalledWith('f-1');
    });

    it('names the remove control even for an unlabelled field', () => {
        renderField({ label: '' });
        expect(screen.getByRole('button', { name: 'Remove Untitled field from page 1' })).toBeInTheDocument();
    });

    it('names the label input by field type and page', () => {
        renderField({ type: 'signature' }, { pageNum: 2 });
        expect(screen.getByRole('textbox', { name: 'Label for signature field on page 2' })).toBeInTheDocument();
    });
});

describe('ResizableDraggableField — presentation', () => {
    it.each([
        ['signature', 'warning'],
        ['initial', 'warning'],
        ['text', 'info'],
        ['date', 'success'],
        ['checkbox', 'accent'],
    ])('tones a %s field with the %s status tokens', (type, tone) => {
        const { container } = renderField({ type });
        const className = container.querySelector('[data-draggable]').className;
        expect(className).toContain(`bg-ds-status-${tone}-bg`);
        expect(className).toContain(`border-ds-status-${tone}-border`);
    });

    it('keeps the class names react-draggable cancels on', () => {
        const { container } = renderField();
        expect(container.querySelector('.resize-handle')).not.toBeNull();
        expect(container.querySelector('.label-input')).not.toBeNull();
    });

    it('no longer hides the resize affordance until hover', () => {
        const { container } = renderField();
        const handle = container.querySelector('.resize-handle');
        expect(handle.className).not.toContain('opacity-0');
        expect(handle.className).toContain('opacity-60');
    });

    it('uses no legacy palette, no raw hex and no 9px or 10px text', () => {
        const { container } = renderField();
        expect(container.innerHTML).not.toMatch(/bg-(yellow|orange|blue|green|purple)-\d{2,3}|bg-red-500|text-gray-600/);
        expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(container.innerHTML).not.toMatch(/text-\[9px\]|text-\[10px\]/);
    });

    it('has no accessibility violations', async () => {
        const { container } = renderField();
        expect((await axe(container)).violations).toEqual([]);
    });
});
