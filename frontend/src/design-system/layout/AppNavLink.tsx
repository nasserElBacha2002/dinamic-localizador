import { NavLink } from "@mantine/core";
import { Link } from "react-router-dom";
import type { AdminNavItem } from "../../utils/company-modules";
import classes from "./app-layout.module.css";

interface AppNavLinkProps {
  item: AdminNavItem;
  active: boolean;
  disabled?: boolean;
  onNavigate?: () => void;
}

export function AppNavLink({ item, active, disabled = false, onNavigate }: AppNavLinkProps) {
  return (
    <NavLink
      component={Link}
      to={item.path}
      label={item.label}
      active={active}
      disabled={disabled}
      onClick={onNavigate}
      className={classes.navLink}
    />
  );
}
