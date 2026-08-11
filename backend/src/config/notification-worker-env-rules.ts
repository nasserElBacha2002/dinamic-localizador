/**
 * Fail-fast rules for WhatsApp notification workers that require a Content SID.
 * Kept pure so unit tests can cover combinations without loading full env.ts.
 */
export const isNonEmptyContentSid = (value: string | undefined | null): boolean =>
  Boolean(value?.trim());

export type WorkerSidGateInput = {
  workerEnabled: boolean;
  contentSid: string | undefined | null;
};

export type WorkerSidGateResult =
  | { ok: true }
  | { ok: false; message: string };

export const requireContentSidWhenWorkerEnabled = (
  input: WorkerSidGateInput,
  contentSidEnvName: string,
  workerEnabledEnvName: string,
): WorkerSidGateResult => {
  if (!input.workerEnabled) {
    return { ok: true };
  }
  if (isNonEmptyContentSid(input.contentSid)) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `${contentSidEnvName} is required when ${workerEnabledEnvName}=true`,
  };
};
