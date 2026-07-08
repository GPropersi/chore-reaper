export type TimezoneOption = {
  value: string;
  city: string;
};

// One representative city per real-world UTC offset (not per IANA identifier —
// there are ~400 of those, nearly all sharing an offset with a nearby major
// city). North America and Europe are preferred where they cover an offset;
// elsewhere the best-known city for that offset is used. `UTC` itself is kept
// as a literal, DST-free option since it's the default new households get
// (see backend bootstrap-admin.ts) and must remain selectable for existing data.
export const MAJOR_TIMEZONES: TimezoneOption[] = [
  { value: 'Pacific/Honolulu', city: 'Honolulu' },
  { value: 'America/Anchorage', city: 'Anchorage' },
  { value: 'America/Los_Angeles', city: 'Los Angeles' },
  { value: 'America/Denver', city: 'Denver' },
  { value: 'America/Chicago', city: 'Chicago' },
  { value: 'America/New_York', city: 'New York' },
  { value: 'America/Halifax', city: 'Halifax' },
  { value: 'America/Sao_Paulo', city: 'São Paulo' },
  { value: 'Atlantic/Azores', city: 'Azores' },
  { value: 'UTC', city: 'UTC' },
  { value: 'Europe/Paris', city: 'Paris' },
  { value: 'Europe/Athens', city: 'Athens' },
  { value: 'Europe/Moscow', city: 'Moscow' },
  { value: 'Asia/Dubai', city: 'Dubai' },
  { value: 'Asia/Karachi', city: 'Karachi' },
  { value: 'Asia/Kolkata', city: 'Mumbai' },
  { value: 'Asia/Dhaka', city: 'Dhaka' },
  { value: 'Asia/Bangkok', city: 'Bangkok' },
  { value: 'Asia/Shanghai', city: 'Beijing' },
  { value: 'Asia/Tokyo', city: 'Tokyo' },
  { value: 'Australia/Sydney', city: 'Sydney' },
  { value: 'Pacific/Auckland', city: 'Auckland' },
];

export const IANA_TIMEZONES: string[] = MAJOR_TIMEZONES.map((tz) => tz.value);

// Current UTC offset for a zone, e.g. "UTC+1" or "UTC-5:30" — computed live
// (rather than hardcoded) so it stays correct across DST transitions.
export function utcOffsetLabel(timezone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(at);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return raw === 'GMT' ? 'UTC+0' : raw.replace('GMT', 'UTC');
}

// A rough human-friendly label for an arbitrary IANA identifier (not just the
// curated list above — a viewer's device can report any zone the OS knows).
export function cityLabel(timezone: string): string {
  const city = timezone.split('/').pop() ?? timezone;
  return city.replace(/_/g, ' ');
}
