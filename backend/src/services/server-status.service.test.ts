import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { dbProbe } from "../database/db-probe";
import { attachmentStorageHealthProbe } from "./attachment-storage/storage-health";
import { env } from "../config/env";
import { serverStatusService } from "./server-status.service";

describe("serverStatusService partial failures", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("returns ok when SQL and GCS are healthy", async () => {
    mock.method(dbProbe, "ping", async () => undefined);
    mock.method(attachmentStorageHealthProbe, "check", async () => ({
      status: "ok" as const,
      configured: true,
      available: true,
      message: null,
      durationMs: 5,
      checkedAt: "2026-08-04T12:00:00.000Z",
    }));

    const snapshot = await serverStatusService.getPlatformStatus();
    assert.equal(snapshot.status, "ok");
    assert.equal(snapshot.database.status, "ok");
    assert.equal(snapshot.gcs.status, "ok");
  });

  it("keeps GCS when SQL fails and marks overall error", async () => {
    mock.method(dbProbe, "ping", async () => {
      throw new Error("ECONNREFUSED internal host sql-prod-01");
    });
    mock.method(attachmentStorageHealthProbe, "check", async () => ({
      status: "ok" as const,
      configured: true,
      available: true,
      message: null,
      durationMs: 5,
      checkedAt: "2026-08-04T12:00:00.000Z",
    }));

    const snapshot = await serverStatusService.getPlatformStatus();
    assert.equal(snapshot.status, "error");
    assert.equal(snapshot.database.status, "error");
    assert.equal(snapshot.gcs.status, "ok");
    assert.equal(snapshot.database.message, "No se pudo conectar con la base de datos");
    assert.doesNotMatch(snapshot.database.message ?? "", /sql-prod|ECONNREFUSED/);
  });

  it("marks degraded when optional GCS is inaccessible", async () => {
    mock.method(dbProbe, "ping", async () => undefined);
    mock.method(attachmentStorageHealthProbe, "check", async () => ({
      status: "error" as const,
      configured: true,
      available: false,
      message: "Almacenamiento inaccesible",
      durationMs: 12,
      checkedAt: "2026-08-04T12:00:00.000Z",
    }));
    const previous = env.GCS_REQUIRED;
    (env as { GCS_REQUIRED: boolean }).GCS_REQUIRED = false;

    try {
      const snapshot = await serverStatusService.getPlatformStatus();
      assert.equal(snapshot.status, "degraded");
      assert.equal(snapshot.gcs.status, "error");
    } finally {
      (env as { GCS_REQUIRED: boolean }).GCS_REQUIRED = previous;
    }
  });

  it("marks overall error when GCS is required and disabled", async () => {
    mock.method(dbProbe, "ping", async () => undefined);
    mock.method(attachmentStorageHealthProbe, "check", async () => ({
      status: "disabled" as const,
      configured: false,
      available: false,
      message: "Almacenamiento no configurado",
      durationMs: 1,
      checkedAt: "2026-08-04T12:00:00.000Z",
    }));
    const previous = env.GCS_REQUIRED;
    (env as { GCS_REQUIRED: boolean }).GCS_REQUIRED = true;

    try {
      const snapshot = await serverStatusService.getPlatformStatus();
      assert.equal(snapshot.status, "error");
      assert.equal(snapshot.gcs.status, "disabled");
    } finally {
      (env as { GCS_REQUIRED: boolean }).GCS_REQUIRED = previous;
    }
  });

  it("treats optional disabled GCS as ok overall", async () => {
    mock.method(dbProbe, "ping", async () => undefined);
    mock.method(attachmentStorageHealthProbe, "check", async () => ({
      status: "disabled" as const,
      configured: false,
      available: false,
      message: "Almacenamiento no configurado",
      durationMs: 1,
      checkedAt: "2026-08-04T12:00:00.000Z",
    }));
    const previous = env.GCS_REQUIRED;
    (env as { GCS_REQUIRED: boolean }).GCS_REQUIRED = false;

    try {
      const snapshot = await serverStatusService.getPlatformStatus();
      assert.equal(snapshot.status, "ok");
      assert.equal(snapshot.gcs.status, "disabled");
    } finally {
      (env as { GCS_REQUIRED: boolean }).GCS_REQUIRED = previous;
    }
  });

  it("surfaces SQL timeout without leaking internals", async () => {
    mock.method(dbProbe, "ping", () => new Promise<void>(() => undefined));
    mock.method(attachmentStorageHealthProbe, "check", async () => ({
      status: "ok" as const,
      configured: true,
      available: true,
      message: null,
      durationMs: 1,
      checkedAt: "2026-08-04T12:00:00.000Z",
    }));
    const previousTimeout = env.PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS;
    (env as { PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS: number }).PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS = 20;

    try {
      const started = Date.now();
      const snapshot = await serverStatusService.getPlatformStatus();
      const elapsed = Date.now() - started;
      assert.equal(snapshot.database.status, "error");
      assert.match(snapshot.database.message ?? "", /Tiempo de espera/);
      assert.ok(elapsed < 2000, `expected budget finish, got ${elapsed}ms`);
    } finally {
      (env as { PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS: number }).PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS =
        previousTimeout;
    }
  });
});
