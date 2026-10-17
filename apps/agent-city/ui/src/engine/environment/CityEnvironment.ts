/** The host's one environment timeline, shared by all vehicles and render effects.
 * Sampling is explicit and deterministic; no Date.now(), timers or Three objects.
 * Geometry freezes do not freeze weather. Cinematics explicitly select clear sky. */
import { weatherAt, type WeatherState } from "./WeatherState";
export type CityEnvironmentSnapshot = Readonly<{
  timestampMs: number;
  mode: "world" | "cinematic";
  hour: number;
  weather: Readonly<WeatherState>;
  rainIntensity: number;
}>;
export class CityEnvironment {
  private cached: CityEnvironmentSnapshot | null = null;
  sample(timestampMs: number, cinematicHour?: number): CityEnvironmentSnapshot {
    if (!Number.isFinite(timestampMs) || cinematicHour !== undefined && !Number.isFinite(cinematicHour)) throw new Error("invalid-environment-time");
    // Stable half-second slots keep audio and visuals on the same weather sample.
    const time = Math.floor(timestampMs / 500) * 500;
    const mode = cinematicHour === undefined ? "world" : "cinematic";
    const cached = this.cached;
    if (cached?.timestampMs === time && cached.mode === mode && (mode === "world" || cached.hour === cinematicHour)) return cached;
    const date = new Date(time);
    const hour = cinematicHour ?? date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const weather = Object.freeze(mode === "cinematic" ? { kind: "clear" as const, intensity: 0, rainbow: 0, overcast: 0 } : weatherAt(time));
    return this.cached = Object.freeze({ timestampMs: time, mode, hour, weather,
      rainIntensity: weather.kind === "rain" ? weather.intensity : 0 });
  }
}
