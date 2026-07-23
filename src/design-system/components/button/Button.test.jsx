import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';
import { Button, IconButton } from './Button';

describe('Button', () => {
  it('uses native button behavior and exposes loading state', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('requires an accessible label for icon-only buttons', () => {
    expect(() => render(<IconButton><span>icon</span></IconButton>))
      .toThrow(/requires a non-empty label/i);
  });

  it('has no structural accessibility violations', async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Continue</Button>
        <IconButton label="Open navigation"><span aria-hidden="true">+</span></IconButton>
      </div>,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
