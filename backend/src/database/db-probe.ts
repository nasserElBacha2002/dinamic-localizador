import { getPool } from "./connection";

/** Thin wrapper so health/status checks can be mocked via mock.method. */
export const dbProbe = {
  async ping(): Promise<void> {
    await getPool().request().query("SELECT 1 AS ok");
  },
};
