const UNIT_TEST_ENV_DEFAULTS: Record<string, string> = {
  NODE_ENV: "test",
  FRONTEND_URL: "http://localhost:5173",
  TZ: "America/Argentina/Buenos_Aires",
  DB_HOST: "localhost",
  DB_PORT: "1433",
  DB_NAME: "dinamic_attendance",
  DB_USER: "sa",
  DB_PASSWORD: "unit-test-db-password",
  JWT_SECRET: "unit-test-jwt-secret",
  TWILIO_VALIDATE_SIGNATURE: "false",
  TWILIO_ACCOUNT_SID: "AC_UNIT_TEST",
  TWILIO_AUTH_TOKEN: "unit-test-twilio-auth-token",
  TWILIO_WHATSAPP_NUMBER: "whatsapp:+10000000000",
  TWILIO_ARRIVAL_REMINDER_CONTENT_SID: "HX_UNIT_TEST_ARRIVAL",
  TWILIO_EXIT_REMINDER_CONTENT_SID: "HX_UNIT_TEST_EXIT",
  TWILIO_TEMPLATE_NO_CHECKIN_SID: "HX_UNIT_TEST_NO_CHECKIN",
};

export const setupUnitTestEnv = (): void => {
  for (const [key, value] of Object.entries(UNIT_TEST_ENV_DEFAULTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};
