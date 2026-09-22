import { Button, Table, TextInput } from "@mantine/core";
import { Link } from "react-router";
import { PageHeader, StatusBadge } from "../../design-system";
import { useClients, useCreateClient } from "../../hooks/useClients";
import { useState } from "react";

export function ClientsListPage() {
  const query = useClients(); const create = useCreateClient(); const [name, setName] = useState("");
  return <><PageHeader title="Clientes" description="Administrá clientes y sus formatos." action={<Button component={Link} to="#new">Nuevo cliente</Button>} />
    <TextInput id="new" label="Nuevo cliente" value={name} onChange={(e) => setName(e.currentTarget.value)} rightSection={<Button size="xs" disabled={!name.trim()} onClick={() => void create.mutateAsync({ name }).then(() => setName(""))}>Crear</Button>} />
    <Table mt="md"><Table.Thead><Table.Tr><Table.Th>Nombre</Table.Th><Table.Th>Estado</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(query.data?.data ?? []).map((client) => <Table.Tr key={client.id}><Table.Td><Link to={`/clients/${client.id}`}>{client.name}</Link></Table.Td><Table.Td><StatusBadge label={client.isActive ? "Activo" : "Inactivo"} tone={client.isActive ? "success" : "neutral"} /></Table.Td></Table.Tr>)}</Table.Tbody></Table></>;
}
