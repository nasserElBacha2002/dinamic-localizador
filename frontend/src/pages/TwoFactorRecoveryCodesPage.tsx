import { Box, Paper, Stack, Title } from "@mantine/core";
import { Navigate, useNavigate } from "react-router";
import {
  clearRecoveryCodesOnce,
  readRecoveryCodesOnce,
} from "../utils/two-factor-recovery-display";
import { RecoveryCodesPanel } from "./settings/RecoveryCodesPanel";
import classes from "./login-page.module.css";

export function TwoFactorRecoveryCodesPage() {
  const navigate = useNavigate();
  const codes = readRecoveryCodesOnce();

  if (!codes || codes.length === 0) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Box className={classes.page}>
      <Box className={classes.centeredLayout}>
        <Box className={classes.formPanel}>
          <Stack w="100%" maw={480} gap="md">
            <Paper className={classes.formCard} radius="lg" withBorder shadow="md" p="xl">
              <Stack gap="lg">
                <Title order={2}>Códigos de recuperación</Title>
                <RecoveryCodesPanel
                  codes={codes}
                  confirmLabel="Continuar a iniciar sesión"
                  onConfirmSaved={() => {
                    clearRecoveryCodesOnce();
                    navigate("/login", { replace: true });
                  }}
                />
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
