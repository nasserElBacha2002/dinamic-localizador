import { Box, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FilterLookupInput } from "../../design-system";
import { useCreateEmployeeCategory, useEmployeeCategories } from "../../hooks/useEmployeeCategories";
import { getApiErrorMessage } from "../../utils/errors";

const NONE_VALUE = "__none__";

interface EmployeeCategorySelectProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  canCreate?: boolean;
  disabled?: boolean;
  /** Keep an inactive category visible when editing an existing assignment. */
  retainedCategory?: { id: string; name: string } | null;
}

export function EmployeeCategorySelect<T extends FieldValues>({
  control,
  name,
  label = "Categoría",
  canCreate = false,
  disabled = false,
  retainedCategory = null,
}: EmployeeCategorySelectProps<T>) {
  const categoriesQuery = useEmployeeCategories({ includeInactive: false });
  const createMutation = useCreateEmployeeCategory();

  const [inputValue, setInputValue] = useState("");
  const [pendingCreateName, setPendingCreateName] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const items = [...(categoriesQuery.data ?? [])];
    if (
      retainedCategory &&
      !items.some((category) => category.id === retainedCategory.id)
    ) {
      items.push({
        id: retainedCategory.id,
        companyId: null,
        name: retainedCategory.name,
        normalizedName: retainedCategory.name.toLocaleLowerCase("es-AR"),
        isSystem: false,
        isActive: false,
        createdAt: "",
        updatedAt: "",
      });
    }
    return items.sort((a, b) => {
      if (a.isSystem !== b.isSystem) {
        return a.isSystem ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "es");
    });
  }, [categoriesQuery.data, retainedCategory]);

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLocaleLowerCase("es-AR");
    const matched = categories.filter((category) =>
      category.name.toLocaleLowerCase("es-AR").includes(query),
    );

    const categoryOptions = matched.map((category) => ({
      value: category.id,
      label: category.name,
      description: category.isSystem
        ? "Base"
        : category.isActive
          ? "Personalizada"
          : "Inactiva (asignación actual)",
    }));

    if (query) {
      return categoryOptions;
    }

    return [{ value: NONE_VALUE, label: "Sin categoría" }, ...categoryOptions];
  }, [categories, inputValue]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selectedValue =
          field.value === null || field.value === undefined || field.value === ""
            ? NONE_VALUE
            : String(field.value);

        const selectedOption =
          selectedValue === NONE_VALUE
            ? { value: NONE_VALUE, label: "Sin categoría" }
            : filteredOptions.find((option) => option.value === selectedValue) ??
              (retainedCategory && retainedCategory.id === selectedValue
                ? { value: retainedCategory.id, label: retainedCategory.name }
                : null);

        const trimmedInput = inputValue.trim();
        const exactMatch = categories.some(
          (category) =>
            category.name.toLocaleLowerCase("es-AR") === trimmedInput.toLocaleLowerCase("es-AR"),
        );
        const showCreate =
          canCreate && Boolean(trimmedInput) && !exactMatch && filteredOptions.length === 0;

        return (
          <Stack gap="xs">
            <FilterLookupInput
              label={label}
              value={selectedValue}
              onChange={(value) => {
                if (!value || value === NONE_VALUE) {
                  field.onChange(null);
                  return;
                }
                if (value === "__create__") {
                  return;
                }
                field.onChange(value);
              }}
              options={filteredOptions}
              inputValue={inputValue}
              onInputChange={setInputValue}
              selectedOption={selectedOption}
              placeholder="Buscar o seleccionar categoría..."
              loading={categoriesQuery.isPending}
              disabled={disabled || createMutation.isPending}
              error={Boolean(fieldState.error) || Boolean(createError)}
              description={fieldState.error?.message}
              emptyMessage={
                showCreate ? `No se encontró “${trimmedInput}”` : "Sin resultados"
              }
              createOption={
                showCreate
                  ? {
                      label: `+ Crear categoría “${trimmedInput}”`,
                      onSelect: () => {
                        setPendingCreateName(trimmedInput);
                        setCreateError(null);
                      },
                    }
                  : undefined
              }
            />

            {pendingCreateName ? (
              <Box
                p="sm"
                style={{
                  border: "1px solid var(--mantine-color-gray-3)",
                  borderRadius: "var(--mantine-radius-md)",
                }}
              >
                <Stack gap="sm">
                  <Text size="sm">
                    ¿Crear la categoría <strong>{pendingCreateName}</strong>?
                  </Text>
                  <TextInput
                    label="Nombre"
                    value={pendingCreateName}
                    onChange={(event) => setPendingCreateName(event.currentTarget.value)}
                    disabled={createMutation.isPending}
                  />
                  {createError ? (
                    <Text size="sm" c="red">
                      {createError}
                    </Text>
                  ) : null}
                  <Group gap="xs">
                    <Button
                      size="xs"
                      loading={createMutation.isPending}
                      onClick={() => {
                        void (async () => {
                          if (!pendingCreateName.trim()) {
                            return;
                          }
                          setCreateError(null);
                          try {
                            const created = await createMutation.mutateAsync({
                              name: pendingCreateName.trim(),
                            });
                            field.onChange(created.id);
                            setInputValue("");
                            setPendingCreateName(null);
                          } catch (error) {
                            setCreateError(getApiErrorMessage(error));
                          }
                        })();
                      }}
                    >
                      Crear y seleccionar
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={createMutation.isPending}
                      onClick={() => {
                        setPendingCreateName(null);
                        setCreateError(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </Group>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        );
      }}
    />
  );
}
