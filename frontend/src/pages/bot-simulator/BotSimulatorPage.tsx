import { Alert, Button, Group, Stack } from "@mantine/core";
import { PageHeader } from "../../design-system";
import classes from "./bot-simulator-console.module.css";
import { BotConversationPanel } from "./components/BotConversationPanel";
import { BotLocationDialog } from "./components/BotLocationDialog";
import { BotSessionPanel } from "./components/BotSessionPanel";
import { BotTechnicalDetails } from "./components/BotTechnicalDetails";
import { useBotSimulatorSession } from "./hooks/useBotSimulatorSession";

export function BotSimulatorPage() {
  const session = useBotSimulatorSession();

  return (
    <Stack gap="md">
      <PageHeader
        title="Simulador de Bot"
        description="Probá flujos de WhatsApp sin enviar mensajes reales."
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
        <Alert color="red">{session.actionError}</Alert>
      ) : null}

      <div className={classes.console}>
        <div>
          <BotSessionPanel {...session} />
        </div>

        <div>
          <BotConversationPanel {...session} />
        </div>

        <div className={classes.technical}>
          <BotTechnicalDetails entries={session.technicalEntries} />
        </div>
      </div>

      <BotLocationDialog {...session} />
    </Stack>
  );
}
