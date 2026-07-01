import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState, type PropsWithChildren } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCompanyPermissions } from "../hooks/useCompanyUsers";
import { CompanySelector } from "../components/company/CompanySelector";

const drawerWidth = 240;

const baseNavItems = [
  { label: "Inicio", path: "/" },
  { label: "Empleados", path: "/employees" },
  { label: "Tiendas", path: "/stores" },
  { label: "Inventarios", path: "/inventories" },
  { label: "Asistencias", path: "/attendance" },
  { label: "Ausencias", path: "/absences" },
  { label: "Estadísticas", path: "/statistics" },
  { label: "Simulador de Bot", path: "/bot-simulator" },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useAuth();
  const permissionsQuery = useCompanyPermissions();
  const canManageUsers = permissionsQuery.data?.permissions.includes("users:manage") ?? false;
  const canReadCompanySettings = permissionsQuery.data?.permissions.includes("company:read") ?? false;
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  let navItems = [...baseNavItems];
  if (canReadCompanySettings) {
    navItems = [...navItems, { label: "Configuración de empresa", path: "/settings/company" }];
  }
  if (canManageUsers) {
    navItems = [...navItems, { label: "Usuarios de empresa", path: "/settings/users" }];
  }
  if (isPlatformAdmin) {
    navItems = [...navItems, { label: "Empresas de plataforma", path: "/platform/companies" }];
  }

  return (
    <List component="nav" aria-label="Navegación principal">
      {navItems.map((item) => {
        const selected =
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

        return (
          <ListItemButton
            key={item.path}
            component={RouterLink}
            to={item.path}
            selected={selected}
            onClick={onNavigate}
          >
            <ListItemText primary={item.label} />
          </ListItemButton>
        );
      })}
    </List>
  );
}

export function AdminLayout({ children }: PropsWithChildren) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1 }}>
        <Toolbar>
          {isMobile ? (
            <Typography
              component="button"
              onClick={() => setMobileOpen(true)}
              sx={{
                border: 0,
                background: "none",
                color: "inherit",
                cursor: "pointer",
                mr: 2,
                font: "inherit",
              }}
              aria-label="Abrir menú"
            >
              Menú
            </Typography>
          ) : null}
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Dinamic Attendance
          </Typography>
          {user ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CompanySelector compact />
              <Typography variant="body2" sx={{ display: { xs: "none", sm: "block" } }}>
                {user.name}
              </Typography>
              <Button color="inherit" size="small" onClick={logout}>
                Cerrar sesión
              </Button>
            </Stack>
          ) : null}
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }} aria-label="Menú lateral">
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{
              display: { xs: "block", md: "none" },
              "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
            }}
          >
            <Toolbar />
            <NavList onNavigate={() => setMobileOpen(false)} />
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: "none", md: "block" },
              "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
            }}
            open
          >
            <Toolbar />
            <NavList />
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minWidth: 0,
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
