import { AppShell } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { PropsWithChildren } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

const NAVBAR_WIDTH = 260;
const HEADER_HEIGHT = 56;
const NAVBAR_BREAKPOINT = "md";

export function AppLayout({ children }: PropsWithChildren) {
  const [mobileOpened, { toggle, close }] = useDisclosure();

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{
        width: NAVBAR_WIDTH,
        breakpoint: NAVBAR_BREAKPOINT,
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <AppTopbar mobileOpened={mobileOpened} onToggleMobile={toggle} />
      </AppShell.Header>

      <AppShell.Navbar p={0} withBorder={false}>
        <AppSidebar onNavigate={close} />
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
