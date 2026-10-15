export interface WeatherSnapshot {
  temperature: number;
  symbol: string;
  forecastAt: string;
  validUntil: string;
  updatedAt: string;
  checkedAt: string;
}
export interface WeatherResponse {
  weather: WeatherSnapshot | null;
}
export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'sun-cloud'
  | 'moon-cloud'
  | 'cloud'
  | 'rain'
  | 'drizzle'
  | 'storm'
  | 'fog'
  | 'snow'
  | 'unknown';
const conditions: Record<string, { label: string; icon: WeatherIcon }> = {
  clearsky: { label: 'Despejado', icon: 'sun' },
  fair: { label: 'Algo nublado', icon: 'sun-cloud' },
  partlycloudy: { label: 'Parcialmente nublado', icon: 'sun-cloud' },
  cloudy: { label: 'Nublado', icon: 'cloud' },
  fog: { label: 'Niebla', icon: 'fog' },
  lightrain: { label: 'Lluvia ligera', icon: 'drizzle' },
  rain: { label: 'Lluvia', icon: 'rain' },
  heavyrain: { label: 'Lluvia intensa', icon: 'rain' },
  lightrainshowers: { label: 'Lluvia ligera', icon: 'drizzle' },
  rainshowers: { label: 'Chubascos', icon: 'rain' },
  heavyrainshowers: { label: 'Lluvia intensa', icon: 'rain' },
  lightsleet: { label: 'Aguanieve', icon: 'snow' },
  sleet: { label: 'Aguanieve', icon: 'snow' },
  heavysleet: { label: 'Aguanieve', icon: 'snow' },
  lightsleetshowers: { label: 'Aguanieve', icon: 'snow' },
  sleetshowers: { label: 'Aguanieve', icon: 'snow' },
  heavysleetshowers: { label: 'Aguanieve', icon: 'snow' },
  lightsnow: { label: 'Nieve ligera', icon: 'snow' },
  snow: { label: 'Nieve', icon: 'snow' },
  heavysnow: { label: 'Nieve intensa', icon: 'snow' },
  lightsnowshowers: { label: 'Nieve ligera', icon: 'snow' },
  snowshowers: { label: 'Nieve', icon: 'snow' },
  heavysnowshowers: { label: 'Nieve intensa', icon: 'snow' },
};
for (const code of [
  'lightrainandthunder',
  'rainandthunder',
  'heavyrainandthunder',
  'lightrainshowersandthunder',
  'rainshowersandthunder',
  'heavyrainshowersandthunder',
  'lightsleetandthunder',
  'sleetandthunder',
  'heavysleetandthunder',
  'lightssleetshowersandthunder',
  'sleetshowersandthunder',
  'heavysleetshowersandthunder',
  'lightsnowandthunder',
  'snowandthunder',
  'heavysnowandthunder',
  'lightssnowshowersandthunder',
  'snowshowersandthunder',
  'heavysnowshowersandthunder',
])
  conditions[code] = { label: 'Tormenta', icon: 'storm' };
export function weatherCondition(symbol: string) {
  const code = symbol.replace(/_(day|night|polartwilight)$/, '');
  const condition = conditions[code] || {
    label: 'Condición no disponible',
    icon: 'unknown' as const,
  };
  const night = symbol.endsWith('_night');
  return {
    ...condition,
    icon:
      night && condition.icon === 'sun'
        ? ('moon' as const)
        : night && condition.icon === 'sun-cloud'
          ? ('moon-cloud' as const)
          : condition.icon,
  };
}
