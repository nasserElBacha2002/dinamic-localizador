import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

type BotTechnicalDetailsProps = {
  entries: Array<{ label: string; value: string }>;
};

export function BotTechnicalDetails({ entries }: BotTechnicalDetailsProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Accordion sx={{ mt: 3 }}>
      <AccordionSummary>
        <Typography fontWeight={600}>Detalles técnicos</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {entries.map((entry) => (
            <Box key={entry.label}>
              <Typography variant="subtitle2" gutterBottom>
                {entry.label}
              </Typography>
              <Typography
                component="pre"
                variant="body2"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "monospace",
                  m: 0,
                }}
              >
                {entry.value}
              </Typography>
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
