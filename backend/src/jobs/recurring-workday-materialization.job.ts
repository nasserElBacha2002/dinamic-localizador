import { env } from "../config/env";
import { recurringWorkdayMaterializationService } from "../services/recurring-workday-materialization.service";

const JOB_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30_000;

let intervalHandle: NodeJS.Timeout | null = null;
let startupHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[recurring-workday-materialization] previous run still in progress, skipping tick");
    return;
  }

  isRunning = true;

  try {
    const summary = await recurringWorkdayMaterializationService.materializeAllCompaniesHorizon();
    console.info("[recurring-workday-materialization] completed", {
      operationsProcessed: summary.operationsProcessed,
      operationsFailed: summary.operationsFailed,
      workdaysCreated: summary.results.reduce((sum, item) => sum + item.operationWorkdaysCreated, 0),
      workdaysUpdated: summary.results.reduce((sum, item) => sum + item.operationWorkdaysUpdated, 0),
      workdaysCancelled: summary.results.reduce((sum, item) => sum + item.operationWorkdaysCancelled, 0),
      employeeWorkdaysCreated: summary.results.reduce((sum, item) => sum + item.employeeWorkdaysCreated, 0),
      employeeWorkdaysCancelled: summary.results.reduce(
        (sum, item) => sum + item.employeeWorkdaysCancelled,
        0,
      ),
    });
  } catch (error) {
    console.error("[recurring-workday-materialization] unexpected job error", error);
  } finally {
    isRunning = false;
  }
};

export const startRecurringWorkdayMaterializationJob = (): void => {
  if (!env.RECURRING_WORKDAY_MATERIALIZATION_JOB_ENABLED) {
    console.info(
      "[recurring-workday-materialization] job not started because RECURRING_WORKDAY_MATERIALIZATION_JOB_ENABLED=false",
    );
    return;
  }

  if (intervalHandle) {
    return;
  }

  console.info(
    `[recurring-workday-materialization] starting scheduler (every ${JOB_INTERVAL_MS / 3_600_000}h, horizon ${env.RECURRING_WORKDAY_HORIZON_DAYS} days)`,
  );

  startupHandle = setTimeout(() => {
    void runJobSafely();
  }, STARTUP_DELAY_MS);

  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopRecurringWorkdayMaterializationJob = (): void => {
  if (startupHandle) {
    clearTimeout(startupHandle);
    startupHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runRecurringWorkdayMaterializationJobHandler = runJobSafely;

export const runRecurringWorkdayMaterializationJobOnce = runJobSafely;
