export const computeRetentionCutoff = (nowUtc: Date, retentionDays: number): Date => {
  const cutoff = new Date(nowUtc.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
};
