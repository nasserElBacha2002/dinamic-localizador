import { DateTime } from "luxon";
import {
  buildWorkTeamDescription,
  buildWorkTeamName,
  generateBatchId,
} from "./markers";
import { createSeedRandom, type SeedRandom } from "./random";
import type {
  AttendanceOutcome,
  ClusterPlan,
  HistoricalSeedPlan,
  PlannedOperation,
  SeedEmployee,
  SeedService,
  WorkTeamPlan,
} from "./types";

const TEAM_SIZE_MIN = 2;
const TEAM_SIZE_MAX = 8;
const CLUSTER_COUNT_TARGET = 3;
const CLUSTER_SIZE_MIN = 4;
const CLUSTER_SIZE_MAX = 6;

/** Mix: primary cluster / cross / random. */
const PRIMARY_SHARE = 0.7;
const CROSS_SHARE = 0.2;

const WORK_TEAM_SHARE = 0.35;

const START_HOURS = [8, 9, 14, 22] as const;
const DURATIONS = [4, 6, 8] as const;

export interface PlanHistoricalSeedInput {
  companyId: string;
  employees: SeedEmployee[];
  services: SeedService[];
  operations: number;
  monthsBack: number;
  seed: number;
  batchId?: string | null;
  timezone: string;
  /** Anchor "today" for reproducibility in tests (ISO date YYYY-MM-DD in company TZ). */
  todayIso?: string;
}

const pickAttendance = (rng: SeedRandom): AttendanceOutcome => {
  const roll = rng.next();
  if (roll < 0.87) {
    return "on_time";
  }
  if (roll < 0.94) {
    return "late";
  }
  return "none";
};

const buildClusters = (
  rng: SeedRandom,
  employees: SeedEmployee[],
  services: SeedService[],
): ClusterPlan[] => {
  const shuffled = rng.shuffle(employees);
  const clusterCount = Math.min(
    CLUSTER_COUNT_TARGET,
    Math.max(1, Math.floor(shuffled.length / CLUSTER_SIZE_MIN)),
  );
  const clusters: ClusterPlan[] = [];
  let cursor = 0;
  for (let i = 0; i < clusterCount; i += 1) {
    const remainingClusters = clusterCount - i;
    const remainingPeople = shuffled.length - cursor;
    const targetSize = Math.min(
      CLUSTER_SIZE_MAX,
      Math.max(CLUSTER_SIZE_MIN, Math.floor(remainingPeople / remainingClusters)),
    );
    const slice = shuffled.slice(cursor, cursor + targetSize);
    cursor += targetSize;
    if (slice.length < TEAM_SIZE_MIN) {
      break;
    }
    const favoriteCount = Math.min(3, services.length);
    const favorites = rng.sample(services, favoriteCount).map((s) => s.id);
    clusters.push({
      index: i,
      employeeIds: slice.map((e) => e.id),
      favoriteServiceIds: favorites,
    });
  }
  return clusters;
};

const distributeWorkDates = (
  rng: SeedRandom,
  count: number,
  monthsBack: number,
  todayIso: string,
  timezone: string,
): string[] => {
  const today = DateTime.fromISO(todayIso, { zone: timezone }).startOf("day");
  const yesterday = today.minus({ days: 1 });
  const oldest = today.minus({ months: monthsBack });

  const windows: Array<{ from: DateTime; to: DateTime; weight: number }> = [];
  const recentStart = today.minus({ days: 90 });
  const midStart = today.minus({ days: 365 });

  if (yesterday >= oldest) {
    windows.push({
      from: DateTime.max(oldest, recentStart),
      to: yesterday,
      weight: 0.45,
    });
  }
  if (midStart < recentStart && yesterday >= oldest) {
    windows.push({
      from: DateTime.max(oldest, midStart),
      to: DateTime.min(yesterday, recentStart.minus({ days: 1 })),
      weight: 0.35,
    });
  }
  if (oldest < midStart) {
    windows.push({
      from: oldest,
      to: DateTime.min(yesterday, midStart.minus({ days: 1 })),
      weight: 0.2,
    });
  }

  const usable = windows.filter((w) => w.to >= w.from);
  if (usable.length === 0) {
    throw new Error("No valid historical date window (monthsBack too small).");
  }

  const weightSum = usable.reduce((s, w) => s + w.weight, 0);
  const dates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let roll = rng.next() * weightSum;
    let chosen = usable[0]!;
    for (const window of usable) {
      roll -= window.weight;
      if (roll <= 0) {
        chosen = window;
        break;
      }
    }
    const spanDays = Math.max(0, Math.floor(chosen.to.diff(chosen.from, "days").days));
    const offset = spanDays === 0 ? 0 : rng.int(0, spanDays);
    dates.push(chosen.from.plus({ days: offset }).toISODate()!);
  }
  return dates;
};

const selectTeamForOperation = (
  rng: SeedRandom,
  clusters: ClusterPlan[],
  allEmployeeIds: string[],
): string[] => {
  const roll = rng.next();
  const primary = rng.pick(clusters);
  const size = rng.int(TEAM_SIZE_MIN, Math.min(TEAM_SIZE_MAX, primary.employeeIds.length));

  if (roll < PRIMARY_SHARE) {
    return rng.sample(primary.employeeIds, size);
  }

  if (roll < PRIMARY_SHARE + CROSS_SHARE && clusters.length > 1) {
    const other = rng.pick(clusters.filter((c) => c.index !== primary.index));
    const baseSize = Math.max(TEAM_SIZE_MIN, size - 1);
    const base = rng.sample(primary.employeeIds, baseSize);
    const guest = rng.pick(other.employeeIds);
    return [...new Set([...base, guest])].slice(0, TEAM_SIZE_MAX);
  }

  return rng.sample(allEmployeeIds, Math.min(size, allEmployeeIds.length));
};

const pickServiceForCluster = (
  rng: SeedRandom,
  cluster: ClusterPlan,
  services: SeedService[],
): string => {
  if (cluster.favoriteServiceIds.length > 0 && rng.chance(0.75)) {
    return rng.pick(cluster.favoriteServiceIds);
  }
  return rng.pick(services).id;
};

const findPrimaryCluster = (clusters: ClusterPlan[], employeeIds: string[]): ClusterPlan => {
  let best = clusters[0]!;
  let bestOverlap = -1;
  for (const cluster of clusters) {
    const set = new Set(cluster.employeeIds);
    const overlap = employeeIds.filter((id) => set.has(id)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = cluster;
    }
  }
  return best;
};

const computeStrongPairs = (
  operations: PlannedOperation[],
): Array<{ leftId: string; rightId: string; sharedOps: number }> => {
  const counts = new Map<string, number>();
  for (const op of operations) {
    const ids = op.assignments.map((a) => a.employeeId).sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([key, sharedOps]) => {
      const [leftId, rightId] = key.split("|") as [string, string];
      return { leftId, rightId, sharedOps };
    })
    .sort((a, b) => b.sharedOps - a.sharedOps)
    .slice(0, 20);
};

/**
 * Builds a deterministic historical seed plan (no I/O).
 */
export const planHistoricalSeed = (input: PlanHistoricalSeedInput): HistoricalSeedPlan => {
  if (input.employees.length < 4) {
    throw new Error(`Need at least 4 eligible employees (got ${input.employees.length}).`);
  }
  if (input.services.length < 1) {
    throw new Error("Need at least 1 service.");
  }
  if (input.operations < 1 || input.operations > 500) {
    throw new Error("--operations must be between 1 and 500.");
  }
  if (input.monthsBack < 1 || input.monthsBack > 36) {
    throw new Error("--months-back must be between 1 and 36.");
  }

  const rng = createSeedRandom(input.seed);
  const batchId = input.batchId?.trim() || generateBatchId(input.seed);
  const todayIso =
    input.todayIso ??
    DateTime.now().setZone(input.timezone).toISODate()!;

  const clusters = buildClusters(rng, input.employees, input.services);
  if (clusters.length === 0) {
    throw new Error("Could not form employee clusters.");
  }

  const allEmployeeIds = input.employees.map((e) => e.id);
  const workTeams: WorkTeamPlan[] = clusters.map((cluster, index) => ({
    index,
    name: buildWorkTeamName(batchId, index),
    description: buildWorkTeamDescription(batchId, `Cluster ${index + 1}`),
    employeeIds: [...cluster.employeeIds],
  }));

  const workDates = distributeWorkDates(
    rng,
    input.operations,
    input.monthsBack,
    todayIso,
    input.timezone,
  );

  const operations: PlannedOperation[] = [];
  let individualAssignments = 0;
  let teamAssignments = 0;
  let employeeWorkdays = 0;
  let attendanceRecords = 0;

  for (let i = 0; i < input.operations; i += 1) {
    const memberIds = selectTeamForOperation(rng, clusters, allEmployeeIds);
    const primary = findPrimaryCluster(clusters, memberIds);
    const serviceId = pickServiceForCluster(rng, primary, input.services);
    const useTeam = rng.chance(WORK_TEAM_SHARE);
    const workTeamIndex = useTeam ? primary.index : null;
    const mode = useTeam ? "work_team" : "individual";

    const assignments = memberIds.map((employeeId) => {
      const attendance = pickAttendance(rng);
      if (attendance !== "none") {
        attendanceRecords += 1;
      }
      return { employeeId, attendance };
    });

    employeeWorkdays += assignments.length;
    if (mode === "work_team") {
      teamAssignments += assignments.length;
    } else {
      individualAssignments += assignments.length;
    }

    operations.push({
      index: i,
      workDate: workDates[i]!,
      startHour: rng.pick([...START_HOURS]),
      durationHours: rng.pick([...DURATIONS]),
      serviceId,
      mode,
      workTeamIndex,
      assignments,
      label: `Op ${i + 1} ${mode}`,
    });
  }

  return {
    batchId,
    companyId: input.companyId,
    seed: input.seed,
    monthsBack: input.monthsBack,
    timezone: input.timezone,
    clusters,
    workTeams,
    operations,
    estimates: {
      operations: operations.length,
      workdays: operations.length,
      individualAssignments,
      teamAssignments,
      employeeWorkdays,
      attendanceRecords,
      workTeams: workTeams.length,
    },
    expectedStrongPairs: computeStrongPairs(operations),
  };
};
