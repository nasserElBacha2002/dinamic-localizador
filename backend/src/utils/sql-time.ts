export const isValidHHmm = (value: string): boolean => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return false;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

/** Parse SQL Server TIME values (string or Date) to HH:mm. */
export const parseSqlTimeToHHmm = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
    if (!match) {
      return null;
    }

    const normalized = `${match[1].padStart(2, "0")}:${match[2]}`;
    return isValidHHmm(normalized) ? normalized : null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hours = value.getUTCHours().toString().padStart(2, "0");
    const minutes = value.getUTCMinutes().toString().padStart(2, "0");
    const normalized = `${hours}:${minutes}`;
    return isValidHHmm(normalized) ? normalized : null;
  }

  return null;
};

/** Convert HH:mm to SQL TIME literal fragment for inserts (HH:mm:ss). */
export const toSqlTimeValue = (time: string | null | undefined): string | null => {
  if (!time) {
    return null;
  }

  if (!isValidHHmm(time)) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    return null;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}:00`;
};
