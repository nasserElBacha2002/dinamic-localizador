import { Alert, Button, Grid, Group } from "@mantine/core";
import { PageHeader } from "../../design-system";
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
          session.sessionState ? (
            <Group gap="sm">
              <Button variant="default" onClick={session.handleNewSimulation} disabled={session.isBusy}>
                Nueva simulación
              </Button>
              <Button variant="default" onClick={session.handleExportJson}>
                Exportar JSON
              </Button>
              <Button variant="default" onClick={() => void session.handleRestart()} disabled={session.isBusy}>
                Reiniciar conversación
              </Button>
            </Group>
          ) : null
        }
      />

      {session.actionError ? (
        <Alert color="red" mb="md">
          {session.actionError}
        </Alert>
      ) : null}

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <BotSessionPanel {...session} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <BotConversationPanel {...session} />
        </Grid.Col>
      </Grid>

      {session.sessionState ? <BotTechnicalDetails entries={session.technicalEntries} /> : null}

      <BotLocationDialog {...session} />
    </>
  );
}
