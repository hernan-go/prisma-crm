import { useQuery } from '@tanstack/react-query';
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  CloudFog,
  Snowflake,
  CircleHelp,
} from 'lucide-react';
import { api } from './api';
import { weatherCondition, type WeatherIcon, type WeatherResponse } from '../shared/weather';
const icons = {
  sun: Sun,
  moon: Moon,
  'sun-cloud': CloudSun,
  'moon-cloud': CloudMoon,
  cloud: Cloud,
  rain: CloudRain,
  drizzle: CloudDrizzle,
  storm: CloudLightning,
  fog: CloudFog,
  snow: Snowflake,
  unknown: CircleHelp,
} satisfies Record<WeatherIcon, typeof Sun>;
export function Weather({ now }: { now: Date }) {
  const query = useQuery({
    queryKey: ['weather', 'rosario'],
    queryFn: () => api<WeatherResponse>('/weather'),
    staleTime: 10 * 60000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      Math.max(
        60000,
        Math.min(
          15 * 60000,
          q.state.data?.weather
            ? Date.parse(q.state.data.weather.validUntil) - Date.now()
            : 15 * 60000,
        ),
      ),
  });
  const candidate = query.data?.weather;
  const weather =
    !query.error &&
    candidate &&
    Date.parse(candidate.validUntil) > now.getTime() &&
    Date.parse(candidate.forecastAt) <= now.getTime() + 30 * 60000
      ? candidate
      : null;
  const condition = weather ? weatherCondition(weather.symbol) : null;
  const Icon = condition ? icons[condition.icon] : null;
  return (
    <div className="dashboard-weather">
      {weather && condition && Icon ? (
        <div
          className="dashboard-weather-value"
          title={`Estimación meteorológica para ${new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Cordoba', dateStyle: 'short', timeStyle: 'short' }).format(new Date(weather.forecastAt))}`}
        >
          <Icon size={28} aria-hidden="true" />
          <strong>{weather.temperature}°C</strong>
        </div>
      ) : null}
      <div className="dashboard-weather-meta">
        <span className="dashboard-weather-location">ROSARIO, SANTA FE</span>
        <span className="dashboard-weather-condition">
          {condition ? condition.label : 'Clima no disponible'}
        </span>
        <small className="dashboard-weather-source">
          <a
            href="https://api.met.no/doc/License"
            target="_blank"
            rel="noreferrer"
            title="Estimación de MET Norway; temperatura redondeada y condición traducida"
          >
            MET Norway
          </a>
          {' · '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
        </small>
      </div>
    </div>
  );
}
