import React, { useEffect, useState } from 'react';
import iconApp from '../../assets/brand/app-icon.png';
import isotipoClaro from '../../assets/brand/logo-isotipo-claro.png';
import isotipoOscuro from '../../assets/brand/logo-isotipo-oscuro.png';
import completoClaro from '../../assets/brand/logo-completo-claro.png';
import completoOscuro from '../../assets/brand/logo-completo-oscuro.png';

export type BrandLogoVariant = 'icon' | 'isotipo' | 'full';
export type BrandLogoTheme = 'light' | 'dark' | 'navy' | 'auto';

export interface BrandLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Tipo de presentación:
   * - 'icon': Sólo el isotipo/icono de la aplicación (cuadrado)
   * - 'isotipo': Isotipo de marca adaptado al tema (claro/oscuro)
   * - 'full': Logo completo con tipografía RestoApp.pe
   */
  variant?: BrandLogoVariant;
  /**
   * Forzar tema visual o 'auto' para detectar el tema activo de la app
   */
  theme?: BrandLogoTheme;
  /**
   * Altura personalizada (ej: 36, '36px')
   */
  height?: number | string;
  /**
   * Ancho personalizado (opcional, por defecto conserva proporción)
   */
  width?: number | string;
}

/**
 * Componente oficial de marca RestoApp.pe.
 * Selecciona automáticamente la variante adecuada (claro/oscuro, isotipo o completo)
 * según el tema activo y las propiedades especificadas.
 */
export function BrandLogo({
  variant = 'isotipo',
  theme = 'auto',
  height = 36,
  width,
  className = '',
  style,
  alt = 'RestoApp.pe',
  ...rest
}: Readonly<BrandLogoProps>) {
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark' | 'navy'>('dark');

  useEffect(() => {
    if (theme !== 'auto') return;

    const readTheme = (): 'light' | 'dark' | 'navy' => {
      if (typeof document === 'undefined') return 'dark';
      const attr = document.documentElement.dataset['theme'];
      if (attr === 'light' || attr === 'dark' || attr === 'navy') {
        return attr;
      }
      return 'dark';
    };

    setActiveTheme(readTheme());

    const observer = new MutationObserver(() => {
      setActiveTheme(readTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, [theme]);

  const effectiveTheme = theme === 'auto' ? activeTheme : theme;
  const isDarkSurface = effectiveTheme === 'dark' || effectiveTheme === 'navy';

  let src: string;
  if (variant === 'icon') {
    src = iconApp;
  } else if (variant === 'full') {
    src = isDarkSurface ? completoOscuro : completoClaro;
  } else {
    src = isDarkSurface ? isotipoOscuro : isotipoClaro;
  }

  return (
    <img
      src={src}
      alt={alt}
      height={height}
      width={width}
      className={`restoapp-brand-logo ${className}`.trim()}
      style={{
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      }}
      data-testid="brand-logo"
      data-variant={variant}
      data-theme={effectiveTheme}
      {...rest}
    />
  );
}
