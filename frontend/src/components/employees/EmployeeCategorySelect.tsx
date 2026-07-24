import { Alert, Box, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FilterLookupInput } from "../../design-system";
import { useCreateEmployeeCategory, useEmployeeCategories } from "../../hooks/useEmployeeCategories";
import { getApiErrorMessage } from "../../utils/errors";
import { normalizeCategoryName } from "../../utils/normalize-category-name";
import { shouldOfferEmployeeCategoryCreate } from "./employee-category-select-logic";

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

  const catalogFailed = categoriesQuery.isError;
  const catalogLoading = categoriesQuery.isPending;
  const canUseCatalog = !catalogFailed && !catalogLoading;

  const categories = useMemo(() => {
    if (!categoriesQuery.data) {
      return [];
    }

    const items = [...categoriesQuery.data];
    if (
      retainedCategory &&
      !items.some((category) => category.id === retainedCategory.id)
    ) {
      items.push({
        id: retainedCategory.id,
        companyId: null,
        name: retainedCategory.name,
        normalizedName: normalizeCategoryName(retainedCategory.name),
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
    const query = normalizeCategoryName(inputValue);
    const matched = query
      ? categories.filter((category) =>
          normalizeCategoryName(category.name).includes(query),
        )
      : categories;

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
        const showCreate = shouldOfferEmployeeCategoryCreate({
          input: trimmedInput,
          categoryNames: categories.map((category) => category.name),
          canCreate,
          catalogReady: canUseCatalog,
          createPending: createMutation.isPending,
        });

        return (
          <Stack gap="xs">
            {catalogFailed ? (
              <Alert
                color="red"
                title="No se pudieron cargar las categorías"
                withCloseButton={false}
              >
                <Stack gap="xs">
                  <Text size="sm">{getApiErrorMessage(categoriesQuery.error)}</Text>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      void categoriesQuery.refetch();
                    }}
                  >
                    Reintentar
                  </Button>
                </Stack>
              </Alert>
            ) : null}

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
              options={catalogFailed ? [] : filteredOptions}
              inputValue={inputValue}
              onInputChange={setInputValue}
              selectedOption={selectedOption}
              placeholder="Buscar o seleccionar categoría..."
              loading={catalogLoading}
              disabled={disabled || createMutation.isPending || catalogFailed}
              error={Boolean(fieldState.error) || Boolean(createError) || catalogFailed}
              description={fieldState.error?.message}
              emptyMessage={
                catalogFailed
                  ? "Catálogo no disponible"
                  : showCreate
                    ? `No hay coincidencia exacta para “${trimmedInput}”`
                    : "Sin resultados"
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
              maxOptions={20}
            />

            {pendingCreateName && canUseCatalog ? (
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
