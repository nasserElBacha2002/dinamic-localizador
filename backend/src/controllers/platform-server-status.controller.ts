import type { Request, Response } from "express";
import {
  platformServerStatusSchema,
  type PlatformServerStatusDto,
} from "../schemas/platform-server-status.schema";
import { serverStatusService } from "../services/server-status.service";

export const platformServerStatusController = {
  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const snapshot = await serverStatusService.getPlatformStatus();
      const parsed = platformServerStatusSchema.safeParse(snapshot);
      if (!parsed.success) {
        console.error("[platform-server-status] invalid snapshot shape", parsed.error.flatten());
        res.status(500).json({
          error: {
            code: "SERVER_STATUS_SNAPSHOT_INVALID",
            message: "No se pudo construir el estado de servidores.",
          },
        });
        return;
      }

      // Always 200 when a validated snapshot was built; component failures live in payload.status.
      const body: PlatformServerStatusDto = parsed.data;
      res.status(200).json(body);
    } catch (error) {
      console.error("[platform-server-status] aggregator failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: "SERVER_STATUS_UNAVAILABLE",
          message: "No se pudo construir el estado de servidores.",
        },
      });
    }
  },
};
