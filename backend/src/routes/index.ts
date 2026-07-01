import { Router } from "express";
import { attendanceRouter } from "./attendance.routes";
import { authRouter } from "./auth.routes";
import { employeeRouter } from "./employee.routes";
import { healthRouter } from "./health.routes";
import { inventoryAssignmentRouter } from "./inventory-assignment.routes";
import { inventoryRouter } from "./inventory.routes";
import { statisticsRouter } from "./statistics.routes";
import { storeRouter } from "./store.routes";
import { twilioRouter } from "./twilio.routes";
import { absenceRouter } from "./absence.routes";
import { botSimulatorRouter } from "./bot-simulator.routes";
import { devReminderRouter } from "./dev-reminder.routes";
import { companyRouter } from "./company.routes";
import { authenticate, requireAdmin } from "../middleware/authenticate";
import { resolveCompanyContext } from "../middleware/company-context";

export const apiRouter = Router();

apiRouter.use("/", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/webhooks/twilio", twilioRouter);

apiRouter.use("/companies", authenticate, companyRouter);

const operationalRouter = Router();
operationalRouter.use(resolveCompanyContext);
operationalRouter.use("/employees", employeeRouter);
operationalRouter.use("/stores", storeRouter);
operationalRouter.use("/inventories", inventoryRouter);
operationalRouter.use("/inventories/:inventoryId/employees", inventoryAssignmentRouter);
operationalRouter.use("/attendance", attendanceRouter);
operationalRouter.use("/statistics", statisticsRouter);
operationalRouter.use("/bot-simulator", botSimulatorRouter);
operationalRouter.use(absenceRouter);
operationalRouter.use("/dev/attendance-reminders", devReminderRouter);

apiRouter.use(authenticate, requireAdmin, operationalRouter);

const companyScopedOperationalRouter = Router({ mergeParams: true });
companyScopedOperationalRouter.use(resolveCompanyContext);
companyScopedOperationalRouter.use("/employees", employeeRouter);
companyScopedOperationalRouter.use("/stores", storeRouter);
companyScopedOperationalRouter.use("/inventories", inventoryRouter);
companyScopedOperationalRouter.use("/inventories/:inventoryId/employees", inventoryAssignmentRouter);
companyScopedOperationalRouter.use("/attendance", attendanceRouter);
companyScopedOperationalRouter.use("/statistics", statisticsRouter);
companyScopedOperationalRouter.use("/bot-simulator", botSimulatorRouter);
companyScopedOperationalRouter.use(absenceRouter);
companyScopedOperationalRouter.use("/dev/attendance-reminders", devReminderRouter);

apiRouter.use("/companies/:companyId", authenticate, requireAdmin, companyScopedOperationalRouter);
