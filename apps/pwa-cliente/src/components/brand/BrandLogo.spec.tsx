import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  beforeEach(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });

  it('renderiza con valores por defecto', () => {
    render(<BrandLogo />);
    const img = screen.getByTestId('brand-logo');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'RestoApp.pe');
    expect(img).toHaveAttribute('data-variant', 'isotipo');
    expect(img).toHaveAttribute('data-theme', 'dark');
  });

  it('soporta variante full para modo claro', () => {
    render(<BrandLogo variant="full" theme="light" />);
    const img = screen.getByTestId('brand-logo');
    expect(img).toHaveAttribute('data-variant', 'full');
    expect(img).toHaveAttribute('data-theme', 'light');
    expect(img.getAttribute('src')).toContain('logo-completo-claro');
  });

  it('soporta variante full para modo oscuro / navy', () => {
    render(<BrandLogo variant="full" theme="navy" />);
    const img = screen.getByTestId('brand-logo');
    expect(img).toHaveAttribute('data-variant', 'full');
    expect(img).toHaveAttribute('data-theme', 'navy');
    expect(img.getAttribute('src')).toContain('logo-completo-oscuro');
  });

  it('soporta variante icon', () => {
    render(<BrandLogo variant="icon" />);
    const img = screen.getByTestId('brand-logo');
    expect(img).toHaveAttribute('data-variant', 'icon');
    expect(img.getAttribute('src')).toContain('app-icon');
  });
});
