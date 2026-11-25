/**
 * DIN-462 closure validation gate helpers (shared by shell script and self-test).
 */

/**
 * @param {number} exitCode
 * @param {boolean} [expectZero=true]
 */
export function evaluateExitCode(exitCode, expectZero = true) {
  const ok = expectZero ? exitCode === 0 : exitCode !== 0;
  return {
    ok,
    exitCode,
    expectZero,
    message: expectZero
      ? `expected exit 0, got ${exitCode}`
      : `expected non-zero exit, got ${exitCode}`,
  };
}

/**
 * @param {string} text
 * @returns {{ tests?: number; pass?: number; fail?: number; skipped?: number } | null}
 */
export function parseTapSummaryLine(text) {
  const chunks = text.match(/# tests (\d+)\s*\n# pass (\d+)\s*\n# fail (\d+)(?:\s*\n# skipped (\d+))?/g);
  if (chunks && chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    const m = last.match(/# tests (\d+)\s*\n# pass (\d+)\s*\n# fail (\d+)(?:\s*\n# skipped (\d+))?/);
    if (m) {
      return {
        tests: Number(m[1]),
        pass: Number(m[2]),
        fail: Number(m[3]),
        skipped: m[4] !== undefined ? Number(m[4]) : undefined,
      };
    }
  }
  const findLast = (re) => {
    const flags = re.flags.includes("g") ? re : new RegExp(re.source, `${re.flags}g`);
    let match;
    let last = null;
    for (const hit of text.matchAll(flags)) {
      last = hit;
    }
    return last;
  };
  const tests = findLast(/^# tests (\d+)/m);
  const pass = findLast(/^# pass (\d+)/m);
  const fail = findLast(/^# fail (\d+)/m);
  const skipped = findLast(/^# skipped (\d+)/m);
  if (!tests || !pass || !fail) {
    return null;
  }
  return {
    tests: Number(tests[1]),
    pass: Number(pass[1]),
    fail: Number(fail[1]),
    skipped: skipped ? Number(skipped[1]) : undefined,
  };
}

/**
 * @param {{ tests?: number; pass?: number; fail?: number; skipped?: number } | null} summary
 */
export function evaluateTapStrict(summary) {
  if (!summary || summary.fail === undefined) {
    return { ok: false, message: "missing TAP summary (# tests / # pass / # fail)" };
  }
  if (summary.fail !== 0) {
    return { ok: false, message: `TAP reports fail=${summary.fail}` };
  }
  if (summary.tests !== undefined && summary.pass !== undefined) {
    const skipped = summary.skipped ?? 0;
    const accounted = summary.pass + skipped;
    if (accounted !== summary.tests) {
      return {
        ok: false,
        message: `TAP pass+skipped (${accounted}) != tests (${summary.tests}) with fail=0`,
      };
    }
  }
  return { ok: true, message: "TAP ok" };
}

/**
 * @param {string[]} before
 * @param {string[]} after
 */
export function diffNewDatabaseNames(before, after) {
  const beforeSet = new Set(before);
  return after.filter((name) => !beforeSet.has(name));
}

/**
 * @param {string[]} newNames
 */
export function evaluateNoNewEphemeralLeaks(newNames) {
  if (newNames.length === 0) {
    return { ok: true, message: "no new ephemeral databases after run" };
  }
  return {
    ok: false,
    message: `new ephemeral databases after run: ${newNames.join(", ")}`,
  };
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function evaluateDisposableValidationEnv(env) {
  const missing = [];
  if (env.TEST_SQL_DISPOSABLE_ACKNOWLEDGED !== "true") {
    missing.push("TEST_SQL_DISPOSABLE_ACKNOWLEDGED=true");
  }
  if (!env.TEST_SQL_ALLOWED_SERVER_NAME?.trim()) {
    missing.push("TEST_SQL_ALLOWED_SERVER_NAME");
  }
  const user = (env.TEST_DB_USER ?? "").trim().toLowerCase();
  if (user === "sa" && env.TEST_SQL_ALLOW_SYSTEM_ADMIN !== "true") {
    missing.push("TEST_SQL_ALLOW_SYSTEM_ADMIN=true (required when TEST_DB_USER=sa)");
  }
  if (!env.TEST_DB_HOST?.trim() || !env.TEST_DB_USER?.trim() || !env.TEST_DB_PASSWORD?.trim()) {
    missing.push("TEST_DB_HOST/TEST_DB_USER/TEST_DB_PASSWORD");
  }
  if (missing.length > 0) {
    return { ok: false, message: `explicit disposable SQL env required: ${missing.join("; ")}` };
  }
  return { ok: true, message: "disposable SQL env present" };
}

/**
 * @param {number} exitCode
 */
export function evaluateInventoryListExit(exitCode) {
  if (exitCode === 0) {
    return { ok: true, message: "inventory list ok" };
  }
  return {
    ok: false,
    message: `mandatory ephemeral inventory failed (exit ${exitCode})`,
  };
}