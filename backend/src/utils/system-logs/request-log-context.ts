import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestLogContext = {
  requestId: string;
  correlationId: string | null;
  jobExecutionId: string | null;
};

const storage = new AsyncLocalStorage<RequestLogContext>();

const REQUEST_ID_MAX = 64;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;

export const isSafeRequestId = (value: string): boolean =>
  value.length <= REQUEST_ID_MAX && REQUEST_ID_RE.test(value);

export const createRequestId = (): string => randomUUID();

export const getRequestLogContext = (): RequestLogContext | undefined => storage.getStore();

export const runWithRequestLogContext = <T>(
  context: RequestLogContext,
  fn: () => T,
): T => storage.run(context, fn);

export const runWithRequestLogContextAsync = <T>(
  context: RequestLogContext,
  fn: () => Promise<T>,
): Promise<T> => storage.run(context, fn);

export const setCorrelationIdOnContext = (correlationId: string | null): void => {
  const store = storage.getStore();
  if (store) {
    store.correlationId = correlationId;
  }
};

export const beginJobLogContext = (jobName: string): RequestLogContext => {
  const jobExecutionId = `${jobName}:${randomUUID()}`;
  return {
    requestId: createRequestId(),
    correlationId: null,
    jobExecutionId,
  };
};
