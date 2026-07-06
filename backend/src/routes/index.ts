import { Router } from "express";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { attendanceRouter } from "./attendance.routes";
import { authRouter } from "./auth.routes";
import { employeeRouter } from "./employee.routes";
import { healthRouter } from "./health.routes";
import { operationAssignmentRouter } from "./operation-assignment.routes";
import { operationRouter } from "./operation.routes";
import { statisticsRouter } from "./statistics.routes";
import { serviceRouter } from "./service.routes";
import { twilioRouter } from "./twilio.routes";
import { absenceRequestRouter } from "./absence-request.routes";
import { absenceTypesRouter } from "./absence-type.routes";
import { botSimulatorRouter } from "./bot-simulator.routes";
import { devReminderRouter } from "./dev-reminder.routes";
import { companyRouter } from "./company.routes";
import { companyUserRouter } from "./company-user.routes";
import { lookupRouter } from "./lookup.routes";
import { platformCompanyRouter } from "./platform-company.routes";
import { authenticate } from "../middleware/authenticate";
import { resolveCompanyContext } from "../middleware/company-context";
import { asyncHandler } from "../middleware/async-handler";
import {
  loadCompanyModuleStates,
  requireAnyCompanyModule,
  requireCompanyModule,
} from "../middleware/require-company-module";

export const apiRouter = Router();

apiRouter.use("/", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/webhooks/twilio", twilioRouter);

apiRouter.use("/companies", authenticate, companyRouter);
apiRouter.use("/platform", authenticate, platformCompanyRouter);

const mountInventoryOperationsServiceRoutes = (router: Router) => {
  const moduleGuard = requireCompanyModule(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS);
  router.use("/services", moduleGuard, serviceRouter);
};

const mountInventoryOperationsOperationRoutes = (router: Router) => {
  const moduleGuard = requireCompanyModule(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS);
  router.use("/operations", moduleGuard, operationRouter);
};

const mountEmployeeRoutes = (router: Router) => {
  const moduleGuard = requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS,
    COMPANY_MODULE_KEYS.ABSENCES,
  );
  router.use("/employees", moduleGuard, employeeRouter);
  router.use("/workers", moduleGuard, employeeRouter);
};

const companyScopedOperationalRouter = Router({ mergeParams: true });
companyScopedOperationalRouter.use(resolveCompanyContext);
companyScopedOperationalRouter.use("/users", companyUserRouter);
companyScopedOperationalRouter.use(asyncHandler(loadCompanyModuleStates));
companyScopedOperationalRouter.use("/lookups", lookupRouter);
mountEmployeeRoutes(companyScopedOperationalRouter);
mountInventoryOperationsServiceRoutes(companyScopedOperationalRouter);
mountInventoryOperationsOperationRoutes(companyScopedOperationalRouter);
companyScopedOperationalRouter.use(
  "/operations/:operationId/employees",
  requireCompanyModule(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS),
  operationAssignmentRouter,
);
companyScopedOperationalRouter.use(
  "/attendance",
  requireCompanyModule(COMPANY_MODULE_KEYS.ATTENDANCE),
  attendanceRouter,
);
companyScopedOperationalRouter.use(
  "/statistics",
  requireCompanyModule(COMPANY_MODULE_KEYS.REPORTS),
  statisticsRouter,
);
companyScopedOperationalRouter.use(
  "/bot-simulator",
  requireCompanyModule(COMPANY_MODULE_KEYS.BOT_SIMULATOR),
  botSimulatorRouter,
);
companyScopedOperationalRouter.use(
  "/absence-types",
  requireCompanyModule(COMPANY_MODULE_KEYS.ABSENCES),
  absenceTypesRouter,
);
companyScopedOperationalRouter.use(
  "/absence-requests",
  requireCompanyModule(COMPANY_MODULE_KEYS.ABSENCES),
  absenceRequestRouter,
);
companyScopedOperationalRouter.use(
  "/dev/attendance-reminders",
  requireCompanyModule(COMPANY_MODULE_KEYS.ATTENDANCE),
  devReminderRouter,
);

apiRouter.use("/companies/:companyId", authenticate, companyScopedOperationalRouter);

const operationalRouter = Router();
operationalRouter.use(resolveCompanyContext);
operationalRouter.use(asyncHandler(loadCompanyModuleStates));
operationalRouter.use("/lookups", lookupRouter);
mountEmployeeRoutes(operationalRouter);
mountInventoryOperationsServiceRoutes(operationalRouter);
mountInventoryOperationsOperationRoutes(operationalRouter);
operationalRouter.use(
  "/operations/:operationId/employees",
  requireCompanyModule(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS),
  operationAssignmentRouter,
);
operationalRouter.use(
  "/attendance",
  requireCompanyModule(COMPANY_MODULE_KEYS.ATTENDANCE),
  attendanceRouter,
);
operationalRouter.use(
  "/statistics",
  requireCompanyModule(COMPANY_MODULE_KEYS.REPORTS),
  statisticsRouter,
);
operationalRouter.use(
  "/bot-simulator",
  requireCompanyModule(COMPANY_MODULE_KEYS.BOT_SIMULATOR),
  botSimulatorRouter,
);
operationalRouter.use(
  "/absence-types",
  requireCompanyModule(COMPANY_MODULE_KEYS.ABSENCES),
  absenceTypesRouter,
);
operationalRouter.use(
  "/absence-requests",
  requireCompanyModule(COMPANY_MODULE_KEYS.ABSENCES),
  absenceRequestRouter,
);
operationalRouter.use(
  "/dev/attendance-reminders",
  requireCompanyModule(COMPANY_MODULE_KEYS.ATTENDANCE),
  devReminderRouter,
);

apiRouter.use(authenticate, operationalRouter);
