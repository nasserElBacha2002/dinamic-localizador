import { env } from "../config/env";
import { monthlyAttendanceReportDeliveryService } from "../services/monthly-attendance-report-delivery.service";
let handle: NodeJS.Timeout | null = null;
let running = false;
export const startMonthlyAttendanceReportJob = (): void => { if (handle || !env.MONTHLY_ATTENDANCE_REPORT_WORKER_ENABLED) return; const tick = async () => { if (running) return; running = true; try { await monthlyAttendanceReportDeliveryService.processTick(); } catch (error) { console.error("[monthly-attendance-report] tick failed", error instanceof Error ? error.message : "unknown"); } finally { running = false; } }; void tick(); handle = setInterval(() => void tick(), env.MONTHLY_ATTENDANCE_REPORT_WORKER_INTERVAL_MS); };
export const stopMonthlyAttendanceReportJob = (): void => { if (handle) clearInterval(handle); handle = null; };
