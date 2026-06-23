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
import { authenticate, requireAdmin } from "../middleware/authenticate";

export const apiRouter = Router();

apiRouter.use("/", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/webhooks/twilio", twilioRouter);

apiRouter.use(authenticate, requireAdmin);
apiRouter.use("/employees", employeeRouter);
apiRouter.use("/stores", storeRouter);
apiRouter.use("/inventories", inventoryRouter);
apiRouter.use("/inventories/:inventoryId/employees", inventoryAssignmentRouter);
apiRouter.use("/attendance", attendanceRouter);
apiRouter.use("/statistics", statisticsRouter);
