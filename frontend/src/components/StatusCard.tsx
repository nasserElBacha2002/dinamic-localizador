import { Card, CardContent, Chip, Stack, Typography } from "@mui/material";

interface StatusCardProps {
  title: string;
  status: "ok" | "error" | "loading";
  details?: string;
}

const statusLabelMap: Record<StatusCardProps["status"], string> = {
  ok: "Operativo",
  error: "Con error",
  loading: "Consultando",
};

const statusColorMap: Record<StatusCardProps["status"], "success" | "error" | "warning"> = {
  ok: "success",
  error: "error",
  loading: "warning",
};

export function StatusCard({ title, status, details }: StatusCardProps) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">{title}</Typography>
          <Chip label={statusLabelMap[status]} color={statusColorMap[status]} size="small" />
        </Stack>

        {details ? <Typography color="text.secondary">{details}</Typography> : null}
      </CardContent>
    </Card>
  );
}
