export function formatDurationFromMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) {
    return "0 h";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} h`;
  }

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${minutes} min`;
}

export function formatDecimalHoursFromMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) {
    return "0";
  }

  return (totalMinutes / 60).toFixed(2);
}
