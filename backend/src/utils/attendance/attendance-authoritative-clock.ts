/** Server clock for REST attendance create punctuality (never client-controlled). */
export const attendanceAuthoritativeClock = {
  now(): Date {
    return new Date();
  },
};
