import { Box, IconButton, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import {
  buildDateInputValue,
  getCalendarViewDateFromRange,
} from "../../utils/date-range";

type DateRangeCalendarProps = {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  disabled?: boolean;
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function isDateInRange(dateValue: string, from: string | null, to: string | null): boolean {
  if (!from || !to) {
    return false;
  }

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  return dateValue >= start && dateValue <= end;
}

export function DateRangeCalendar({
  from,
  to,
  onChange,
  disabled = false,
}: DateRangeCalendarProps) {
  const initialView = useMemo(() => getCalendarViewDateFromRange(from, to), [from, to]);
  const [viewYear, setViewYear] = useState(initialView.year);
  const [viewMonth, setViewMonth] = useState(initialView.month);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(viewYear, viewMonth - 1, 1));
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const leadingEmpty = (firstDayOfMonth.getUTCDay() + 6) % 7;

    const cells: Array<{ key: string; dateValue: string | null; day: number | null }> = [];

    for (let index = 0; index < leadingEmpty; index += 1) {
      cells.push({ key: `empty-start-${index}`, dateValue: null, day: null });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateValue = buildDateInputValue(viewYear, viewMonth, day);
      cells.push({ key: dateValue, dateValue, day });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ key: `empty-end-${cells.length}`, dateValue: null, day: null });
    }

    return cells;
  }, [viewMonth, viewYear]);

  const shiftMonth = (delta: number) => {
    const shifted = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1));
    setViewYear(shifted.getUTCFullYear());
    setViewMonth(shifted.getUTCMonth() + 1);
  };

  const shiftYear = (delta: number) => {
    setViewYear((current) => current + delta);
  };

  const handleDayClick = (dateValue: string) => {
    if (disabled) {
      return;
    }

    if (!from || (from && to)) {
      onChange(dateValue, null);
      return;
    }

    if (dateValue < from) {
      onChange(dateValue, from);
      return;
    }

    onChange(from, dateValue);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <IconButton
          aria-label="Año anterior"
          size="small"
          onClick={() => shiftYear(-1)}
          disabled={disabled}
        >
          «
        </IconButton>
        <IconButton
          aria-label="Mes anterior"
          size="small"
          onClick={() => shiftMonth(-1)}
          disabled={disabled}
        >
          ‹
        </IconButton>
        <Typography variant="subtitle2" sx={{ minWidth: 120, textAlign: "center" }}>
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </Typography>
        <IconButton
          aria-label="Mes siguiente"
          size="small"
          onClick={() => shiftMonth(1)}
          disabled={disabled}
        >
          ›
        </IconButton>
        <IconButton
          aria-label="Año siguiente"
          size="small"
          onClick={() => shiftYear(1)}
          disabled={disabled}
        >
          »
        </IconButton>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 1,
        }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <Typography
            key={label}
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: "center", fontWeight: 600 }}
          >
            {label}
          </Typography>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
        }}
      >
        {calendarDays.map((cell) => {
          if (!cell.dateValue || cell.day === null) {
            return <Box key={cell.key} sx={{ height: 32 }} />;
          }

          const isStart = cell.dateValue === from;
          const isEnd = cell.dateValue === to;
          const inRange = isDateInRange(cell.dateValue, from, to);

          return (
            <Box
              key={cell.key}
              component="button"
              type="button"
              onClick={() => handleDayClick(cell.dateValue!)}
              disabled={disabled}
              sx={{
                height: 32,
                border: "none",
                borderRadius: 1,
                cursor: disabled ? "not-allowed" : "pointer",
                bgcolor: isStart || isEnd ? "primary.main" : inRange ? "action.selected" : "transparent",
                color: isStart || isEnd ? "primary.contrastText" : "text.primary",
                fontSize: "0.8125rem",
                fontWeight: isStart || isEnd ? 700 : 400,
                "&:hover": {
                  bgcolor: disabled
                    ? undefined
                    : isStart || isEnd
                      ? "primary.dark"
                      : "action.hover",
                },
              }}
            >
              {cell.day}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
