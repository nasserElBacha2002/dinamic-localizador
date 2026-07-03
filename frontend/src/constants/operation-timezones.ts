export const DEFAULT_OPERATION_TIMEZONE = "America/Argentina/Buenos_Aires";

const PREFERRED_OPERATION_TIMEZONES: Array<{ value: string; region: string }> = [
  { value: "America/Argentina/Buenos_Aires", region: "Argentina" },
  { value: "America/Montevideo", region: "Uruguay" },
  { value: "America/Santiago", region: "Chile" },
  { value: "America/Sao_Paulo", region: "Brasil" },
  { value: "America/Bogota", region: "Colombia" },
  { value: "America/Lima", region: "Perú" },
  { value: "America/Mexico_City", region: "México central" },
  { value: "America/New_York", region: "Este EE.UU." },
  { value: "America/Chicago", region: "Centro EE.UU." },
  { value: "America/Denver", region: "Montaña EE.UU." },
  { value: "America/Los_Angeles", region: "Pacífico EE.UU." },
  { value: "Europe/Madrid", region: "España" },
  { value: "Europe/London", region: "Reino Unido" },
  { value: "UTC", region: "UTC" },
];

export type OperationTimezoneOption = {
  value: string;
  label: string;
};

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function getTimezoneOffsetLabel(timezone: string): string {
  try {
    return (
      new Intl.DateTimeFormat("es-AR", {
        timeZone: timezone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? timezone
    );
  } catch {
    return timezone;
  }
}

function parseOffsetMinutes(offsetLabel: string): number {
  if (offsetLabel === "UTC" || offsetLabel === "GMT") {
    return 0;
  }

  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function formatTimezoneLabel(offsetLabel: string, region: string): string {
  return `${offsetLabel} — ${region}`;
}

function buildPreferredTimezoneOptions(): OperationTimezoneOption[] {
  const seenOffsets = new Set<string>();
  const options: OperationTimezoneOption[] = [];

  for (const entry of PREFERRED_OPERATION_TIMEZONES) {
    if (!isValidTimezone(entry.value)) {
      continue;
    }

    const offsetLabel = getTimezoneOffsetLabel(entry.value);
    if (seenOffsets.has(offsetLabel)) {
      continue;
    }

    seenOffsets.add(offsetLabel);
    options.push({
      value: entry.value,
      label: formatTimezoneLabel(offsetLabel, entry.region),
    });
  }

  return options.sort(
    (left, right) =>
      parseOffsetMinutes(getTimezoneOffsetLabel(left.value)) -
      parseOffsetMinutes(getTimezoneOffsetLabel(right.value)),
  );
}

export function getCanonicalOperationTimezone(timezone: string): string {
  const trimmed = timezone.trim();
  if (!trimmed || !isValidTimezone(trimmed)) {
    return DEFAULT_OPERATION_TIMEZONE;
  }

  const preferredOptions = buildPreferredTimezoneOptions();
  const targetOffset = getTimezoneOffsetLabel(trimmed);
  const matchingPreferred = preferredOptions.find(
    (option) => getTimezoneOffsetLabel(option.value) === targetOffset,
  );

  if (matchingPreferred) {
    return matchingPreferred.value;
  }

  return trimmed;
}

export function getOperationTimezoneOptions(currentValue?: string): OperationTimezoneOption[] {
  const options = buildPreferredTimezoneOptions();
  const trimmedCurrent = currentValue?.trim();

  if (!trimmedCurrent || !isValidTimezone(trimmedCurrent)) {
    return options;
  }

  const canonicalCurrent = getCanonicalOperationTimezone(trimmedCurrent);
  if (options.some((option) => option.value === canonicalCurrent)) {
    return options;
  }

  const offsetLabel = getTimezoneOffsetLabel(trimmedCurrent);
  const region = trimmedCurrent.includes("/")
    ? trimmedCurrent.split("/").slice(1).join(" / ").replace(/_/g, " ")
    : trimmedCurrent;

  return [
    ...options,
    {
      value: trimmedCurrent,
      label: formatTimezoneLabel(offsetLabel, region),
    },
  ].sort(
    (left, right) =>
      parseOffsetMinutes(getTimezoneOffsetLabel(left.value)) -
      parseOffsetMinutes(getTimezoneOffsetLabel(right.value)),
  );
}
