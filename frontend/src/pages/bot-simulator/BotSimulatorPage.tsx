import { Alert, Button, Grid, Stack } from "@mui/material";
import { PageHeader } from "../../components/common/PageHeader";
import { BotConversationPanel } from "./components/BotConversationPanel";
import { BotLocationDialog } from "./components/BotLocationDialog";
import { BotSessionPanel } from "./components/BotSessionPanel";
import { BotTechnicalDetails } from "./components/BotTechnicalDetails";
import { useBotSimulatorSession } from "./hooks/useBotSimulatorSession";

export function BotSimulatorPage() {
  const session = useBotSimulatorSession();

  return (
    <>
      <PageHeader
        title="Simulador de Bot"
        description="Probá flujos conversacionales del bot de WhatsApp sin depender del webhook de Twilio."
        action={
          <Stack direction="row" spacing={1}>
            {session.sessionState ? (
              <>
                <Button variant="outlined" onClick={session.handleNewSimulation} disabled={session.isBusy}>
                  Nueva simulación
                </Button>
                <Button variant="outlined" onClick={session.handleExportJson}>
                  Exportar JSON
                </Button>
                <Button variant="outlined" onClick={() => void session.handleRestart()} disabled={session.isBusy}>
                  Reiniciar conversación
                </Button>
              </>
            ) : null}
          </Stack>
        }
      />

      {session.actionError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {session.actionError}
        </Alert>
      ) : null}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <BotSessionPanel {...session} />
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <BotConversationPanel {...session} />
        </Grid>
      </Grid>

      {session.sessionState ? <BotTechnicalDetails entries={session.technicalEntries} /> : null}

      <BotLocationDialog {...session} />
    </>
  );
}
