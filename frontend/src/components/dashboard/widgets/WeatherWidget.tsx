import { useEffect, useState } from 'react';
import { IconSun, IconCloud, IconCloudFog, IconCloudRain, IconSnowflake, IconCloudStorm } from '@tabler/icons-react';
import { api } from '../../../api/client';
import type { WeatherOut } from '../../../types';

const CONDITION_ICON: Record<string, typeof IconSun> = {
  clear: IconSun,
  cloudy: IconCloud,
  fog: IconCloudFog,
  rain: IconCloudRain,
  snow: IconSnowflake,
  thunderstorm: IconCloudStorm,
};

// Self-fetches rather than reading off the shared dashboard `data` prop (like
// every other widget) -- weather isn't part of the /dashboard aggregate on
// purpose, since that endpoint is hit every 5 minutes by the ambient risk-nudge
// poll and shouldn't carry an external HTTP call for every admin, every tick.
export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherOut | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<WeatherOut>('/weather')
      .then(setWeather)
      .catch(() => setError(true));
  }, []);

  if (error) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Weather unavailable.</div>;
  if (!weather) return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>;

  const Icon = CONDITION_ICON[weather.condition] || IconCloud;
  const today = weather.daily[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Icon size={40} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 24, fontWeight: 600 }}>{Math.round(weather.current_temp_f)}°F</div>
        <div style={{ fontSize: 12, color: 'var(--t2)', textTransform: 'capitalize' }}>Indianapolis · {weather.condition}</div>
      </div>
      {today && (
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--t2)' }}>
          <div>
            H {Math.round(today.high_f)}° / L {Math.round(today.low_f)}°
          </div>
          {today.precipitation_chance !== null && <div>{today.precipitation_chance}% precip</div>}
        </div>
      )}
    </div>
  );
}
