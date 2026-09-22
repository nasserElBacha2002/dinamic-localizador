import { Button, Group, Stack, Switch, Table, TextInput } from "@mantine/core";
import { useParams } from "react-router";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "../../design-system";
import { useClient, useClientLocationTypes, useCreateClientLocationType, useDisableClientLocationType, useUpdateClientLocationType } from "../../hooks/useClients";
import { useState } from "react";

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>(); const client = useClient(id); const types = useClientLocationTypes(id); const create = useCreateClientLocationType(id ?? ""); const update = useUpdateClientLocationType(id ?? ""); const disable = useDisableClientLocationType(id ?? ""); const [name, setName] = useState("");
  if (!id) return <ErrorState message="Cliente no encontrado." />; if (client.isLoading) return <LoadingState />; if (!client.data) return <ErrorState message="Cliente no encontrado." />;
  return <Stack><PageHeader title={client.data.name} description="Formatos propios del cliente." action={<StatusBadge label={client.data.isActive ? "Activo" : "Inactivo"} tone={client.data.isActive ? "success" : "neutral"} />} />
    <Group align="end"><TextInput label="Nuevo formato" value={name} onChange={(e) => setName(e.currentTarget.value)} /><Button disabled={!client.data.isActive || !name.trim()} onClick={() => void create.mutateAsync({ name }).then(() => setName(""))}>Nuevo formato</Button></Group>
    <Table><Table.Thead><Table.Tr><Table.Th>Nombre</Table.Th><Table.Th>Código</Table.Th><Table.Th>Activo</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(types.data ?? []).map((type) => <Table.Tr key={type.id}><Table.Td>{type.name}</Table.Td><Table.Td>{type.code}</Table.Td><Table.Td><Switch checked={type.isActive} onChange={(e) => void (e.currentTarget.checked ? update.mutateAsync({ id: type.id, input: { isActive: true } }) : disable.mutateAsync(type.id))} /></Table.Td></Table.Tr>)}</Table.Tbody></Table></Stack>;
}
