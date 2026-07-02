import { ActionIcon, Box, Group, SimpleGrid, Text, UnstyledButton } from "@mantine/core";
import { useMemo, useState } from "react";
import { designTokens } from "../theme/tokens";
import {
  buildDateInputValue,
  getCalendarViewDateFromRange,
} from "../../utils/date-range";
import classes from "./date-range-calendar.module.css";

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
    <Box className={classes.root}>
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <ActionIcon
          aria-label="Año anterior"
          size="sm"
          variant="subtle"
          onClick={() => shiftYear(-1)}
          disabled={disabled}
        >
          «
        </ActionIcon>
        <ActionIcon
          aria-label="Mes anterior"
          size="sm"
          variant="subtle"
          onClick={() => shiftMonth(-1)}
          disabled={disabled}
        >
          ‹
        </ActionIcon>
        <Text size="sm" fw={600} ta="center" style={{ minWidth: 120 }}>
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </Text>
        <ActionIcon
          aria-label="Mes siguiente"
          size="sm"
          variant="subtle"
          onClick={() => shiftMonth(1)}
          disabled={disabled}
        >
          ›
        </ActionIcon>
        <ActionIcon
          aria-label="Año siguiente"
          size="sm"
          variant="subtle"
          onClick={() => shiftYear(1)}
          disabled={disabled}
        >
          »
        </ActionIcon>
      </Group>

      <SimpleGrid cols={7} spacing={4} mb="xs">
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} size="xs" c="dimmed" ta="center" fw={600}>
            {label}
          </Text>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={7} spacing={4}>
        {calendarDays.map((cell) => {
          if (!cell.dateValue || cell.day === null) {
            return <Box key={cell.key} h={32} />;
          }

          const isStart = cell.dateValue === from;
          const isEnd = cell.dateValue === to;
          const inRange = isDateInRange(cell.dateValue, from, to);
          const isSelected = isStart || isEnd;

          return (
            <UnstyledButton
              key={cell.key}
              type="button"
              onClick={() => handleDayClick(cell.dateValue!)}
              disabled={disabled}
              className={classes.day}
              data-selected={isSelected || undefined}
              data-in-range={inRange && !isSelected ? true : undefined}
              style={
                isSelected
                  ? {
                      backgroundColor: designTokens.colors.primary,
                      color: designTokens.colors.surface,
                    }
                  : inRange
                    ? { backgroundColor: designTokens.colors.primaryLight }
                    : undefined
              }
            >
              {cell.day}
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
