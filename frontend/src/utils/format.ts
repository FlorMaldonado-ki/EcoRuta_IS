/**
 * Formato de números para la app (independiente de Intl, que no siempre está
 * completo en Android): separador de miles "," y decimales ".", como en es-MX.
 */

/** 12450.7 → "12,451" · 1.2286 → "1.229" (decimales máximos, sin ceros sobrantes). */
export function formatNumber(value: number, maxDecimals = 0): string {
  if (!Number.isFinite(value)) return '0';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
  const [int, dec = ''] = rounded.toFixed(maxDecimals).split('.');
  const withThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = dec.replace(/0+$/, '');
  return `${value < 0 && rounded !== 0 ? '-' : ''}${withThousands}${decimals ? `.${decimals}` : ''}`;
}

/** Kilogramos de CO₂: 3 decimales si es poco (1.229 kg), 1 si es mediano, enteros si es mucho (12,450 kg). */
export function formatKg(kg: number): string {
  const abs = Math.abs(kg);
  const decimals = abs < 100 ? 3 : abs < 10_000 ? 1 : 0;
  return `${formatNumber(kg, decimals)} kg`;
}

/** Kilómetros: 1 decimal (12,345.6 km). */
export const formatKm = (km: number) => `${formatNumber(km, 1)} km`;
