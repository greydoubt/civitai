import {
  ActionIcon,
  Button,
  Container,
  Divider,
  Grid,
  Group,
  Paper,
  Stack,
  Switch,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Model, ModelFileType, ModelStatus, ModelType } from '@prisma/client';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconCheck,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons';
import { TRPCClientErrorBase } from '@trpc/client';
import { DefaultErrorShape } from '@trpc/server';
import { useRouter } from 'next/router';
import React, { useMemo, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { z } from 'zod';

import {
  Form,
  InputCheckbox,
  InputFileUpload,
  InputImageUpload,
  InputMultiSelect,
  InputNumber,
  InputRTE,
  InputSelect,
  InputText,
  useForm,
} from '~/libs/form';
import { modelSchema } from '~/server/schema/model.schema';
import { modelVersionUpsertSchema } from '~/server/schema/model-version.schema';
import { ImageMetaProps } from '~/server/schema/image.schema';
import { ModelById } from '~/types/router';
import { slugit, splitUppercase } from '~/utils/string-helpers';
import { trpc } from '~/utils/trpc';
import { isDefined } from '~/utils/type-guards';

const schema = modelSchema.extend({ tagsOnModels: z.string().array() });

type CreateModelProps = z.infer<typeof modelSchema>;
type UpdateModelProps = Omit<CreateModelProps, 'id'> & { id: number };

type Props = { model?: ModelById };

export function ModelForm({ model }: Props) {
  const router = useRouter();
  const queryUtils = trpc.useContext();
  const editing = !!model;

  const { data: { items: tags } = { items: [] } } = trpc.tag.getAll.useQuery(
    { limit: 0 },
    { cacheTime: Infinity, staleTime: Infinity }
  );
  const addMutation = trpc.model.add.useMutation();
  const updateMutation = trpc.model.update.useMutation();
  const [uploading, setUploading] = useState(false);
  const [hasTrainingWords, setHasTrainingWords] = useState(true);

  const defaultModelFile = { name: '', url: '', sizeKB: 0, type: ModelFileType.Model };

  const defaultModelVersion: z.infer<typeof modelVersionUpsertSchema> = {
    name: '',
    description: '',
    epochs: null,
    steps: null,
    trainedWords: [],
    images: [],
    modelFile: defaultModelFile,
  };

  const defaultValues: z.infer<typeof schema> = {
    ...model,
    name: model?.name ?? '',
    type: model?.type ?? ModelType.Checkpoint,
    status: model?.status ?? ModelStatus.Published,
    tagsOnModels: model?.tagsOnModels.map(({ tag }) => tag.name) ?? [],
    modelVersions: model?.modelVersions.map(({ trainedWords, images, modelFile, ...version }) => ({
      ...version,
      modelFile: modelFile ?? defaultModelFile,
      trainedWords: trainedWords ?? [],
      // HOTFIX: Casting image.meta type issue with generated prisma schema
      images: images.map(({ image }) => ({ ...image, meta: image.meta as ImageMetaProps })) ?? [],
    })) ?? [defaultModelVersion],
  };

  const form = useForm({
    schema: schema,
    shouldUnregister: false,
    mode: 'onChange',
    defaultValues,
  });

  const { fields, prepend, remove, swap } = useFieldArray({
    control: form.control,
    name: 'modelVersions',
  });

  const tagsOnModels = form.watch('tagsOnModels');

  const tagsData = useMemo(() => {
    return [...tags.map((x) => x.name), ...(tagsOnModels ?? [])?.filter(isDefined)];
  }, [tagsOnModels, tags]);

  const mutating = addMutation.isLoading || updateMutation.isLoading;

  const handleSubmit = (values: z.infer<typeof schema>) => {
    const commonOptions = {
      async onSuccess(results: Model | undefined, input: { id?: number }) {
        const modelLink = `/models/${results?.id}/${slugit(results?.name ?? '')}`;

        showNotification({
          title: 'Your model was saved',
          message: `Successfully ${editing ? 'updated' : 'created'} the model.`,
          color: 'teal',
          icon: <IconCheck size={18} />,
        });
        await queryUtils.model.invalidate();
        await queryUtils.tag.invalidate();
        router.push({ pathname: modelLink, query: { showNsfw: true } }, modelLink, {
          shallow: !!input.id,
        });
      },
      onError(error: TRPCClientErrorBase<DefaultErrorShape>) {
        const message = error.message;

        showNotification({
          title: 'Could not save model',
          message: `An error occurred while saving the model: ${message}`,
          color: 'red',
          icon: <IconX size={18} />,
        });
      },
    };

    const data: CreateModelProps | UpdateModelProps = {
      ...values,
      tagsOnModels: values.tagsOnModels?.map((name) => {
        const match = tags.find((x) => x.name === name);
        return match ?? { name };
      }),
    };

    if (editing) updateMutation.mutate(data as UpdateModelProps, commonOptions);
    else addMutation.mutate(data as CreateModelProps, commonOptions);
  };

  return (
    <Container>
      <Group spacing="lg" mb="lg">
        <ActionIcon variant="outline" size="lg" onClick={() => router.back()}>
          <IconArrowLeft size={20} stroke={1.5} />
        </ActionIcon>
        <Title order={3}>{model ? 'Editing model' : 'Upload model'}</Title>
      </Group>
      <Form form={form} onSubmit={handleSubmit}>
        <Grid gutter="xl">
          <Grid.Col lg={8}>
            <Stack>
              <Paper radius="md" p="xl" withBorder>
                <Stack>
                  <InputText name="name" label="Name" placeholder="Name" withAsterisk />
                  <InputRTE
                    name="description"
                    label="About your model"
                    description="Tell us what your model does"
                  />
                </Stack>
              </Paper>
              <Group sx={{ justifyContent: 'space-between' }}>
                <Title order={4}>Model Versions</Title>
                <Button
                  size="xs"
                  leftIcon={<IconPlus size={16} />}
                  variant="outline"
                  onClick={() => prepend(defaultModelVersion)}
                  compact
                >
                  Add Version
                </Button>
              </Group>
              {/* Model Versions */}
              {fields.map((version, index) => {
                const trainedWords = form.watch(`modelVersions.${index}.trainedWords`);
                return (
                  <Paper
                    data-version-index={index}
                    key={version.id ?? index}
                    radius="md"
                    p="xl"
                    withBorder
                  >
                    <Stack style={{ position: 'relative' }}>
                      <Grid gutter="md">
                        <Grid.Col span={12}>
                          <Group noWrap align="flex-end" spacing="xs">
                            <InputText
                              name={`modelVersions.${index}.name`}
                              label="Name"
                              placeholder="Version Name"
                              withAsterisk
                              style={{ flex: 1 }}
                            />
                            {fields.length > 1 && (
                              <>
                                {index < fields.length - 1 && (
                                  <ActionIcon
                                    variant="default"
                                    onClick={() => swap(index, index + 1)}
                                    size="lg"
                                  >
                                    <IconArrowDown size={16} />
                                  </ActionIcon>
                                )}
                                {index > 0 && (
                                  <ActionIcon
                                    variant="default"
                                    onClick={() => swap(index, index - 1)}
                                    size="lg"
                                  >
                                    <IconArrowUp size={16} />
                                  </ActionIcon>
                                )}
                                <ActionIcon
                                  color="red"
                                  onClick={() => remove(index)}
                                  variant="outline"
                                  size="lg"
                                >
                                  <IconTrash size={16} stroke={1.5} />
                                </ActionIcon>
                              </>
                            )}
                          </Group>
                        </Grid.Col>
                        <Grid.Col span={12}>
                          <InputRTE
                            name={`modelVersions.${index}.description`}
                            label="Version changes or notes"
                            description="Tell us about this version"
                          />
                        </Grid.Col>
                        <Grid.Col span={12}>
                          {hasTrainingWords && (
                            <InputMultiSelect
                              name={`modelVersions.${index}.trainedWords`}
                              label="Trigger Words"
                              placeholder="e.g.: Master Chief"
                              description="Please input the words you have trained your model with"
                              data={trainedWords}
                              creatable
                              getCreateLabel={(query) => `+ Create ${query}`}
                              clearable
                              searchable
                              required
                            />
                          )}
                          <Switch
                            label="This model doesn't require any trigger words"
                            onChange={() => setHasTrainingWords((x) => !x)}
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <InputNumber
                            name={`modelVersions.${index}.epochs`}
                            label="Training Epochs"
                            placeholder="Training Epochs"
                            min={0}
                            max={100}
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <InputNumber
                            name={`modelVersions.${index}.steps`}
                            label="Training Steps"
                            placeholder="Training Steps"
                            min={0}
                            step={500}
                          />
                        </Grid.Col>
                        <Grid.Col span={12}>
                          <InputFileUpload
                            name={`modelVersions.${index}.modelFile`}
                            label="Model File"
                            placeholder="Pick your model"
                            uploadType="Model"
                            accept=".ckpt,.pt,.safetensors"
                            onLoading={setUploading}
                            withAsterisk
                          />
                        </Grid.Col>
                        <Grid.Col span={12}>
                          <InputFileUpload
                            name={`modelVersions.${index}.trainingDataFile`}
                            label="Training Data"
                            placeholder="Pick your training data"
                            description="The data you used to train your model (as .zip archive)"
                            uploadType="TrainingData"
                            accept=".zip"
                            onLoading={setUploading}
                          />
                        </Grid.Col>
                        <Grid.Col span={12}>
                          <InputImageUpload
                            name={`modelVersions.${index}.images`}
                            label="Example Images"
                            max={20}
                            hasPrimaryImage
                            withAsterisk
                            onChange={(values) => setUploading(values.some((x) => x.file))}
                          />
                        </Grid.Col>
                      </Grid>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Grid.Col>
          <Grid.Col lg={4}>
            <Stack sx={{ position: 'sticky', top: 90 }}>
              <Paper radius="md" p="xl" withBorder>
                <Stack>
                  <Title order={4}>Model Properties</Title>
                  <InputSelect
                    name="status"
                    label="Status"
                    placeholder="Status"
                    data={[ModelStatus.Published, ModelStatus.Draft]}
                    withAsterisk
                  />
                  <InputSelect
                    name="type"
                    label="Type"
                    placeholder="Type"
                    data={Object.values(ModelType).map((type) => ({
                      label: splitUppercase(type),
                      value: type,
                    }))}
                    withAsterisk
                  />

                  <InputMultiSelect
                    name="tagsOnModels"
                    label="Tags"
                    placeholder="e.g.: portrait, sharp focus, etc."
                    description="Please add your tags"
                    data={tagsData}
                    creatable
                    getCreateLabel={(query) => `+ Create ${query}`}
                    clearable
                    searchable
                  />
                  <InputCheckbox
                    name="nsfw"
                    label="This model or images associated with it are NSFW"
                  />
                </Stack>
              </Paper>
              <Group position="right" mt="lg">
                <Button
                  variant="outline"
                  onClick={() => form.reset()}
                  disabled={!form.formState.isDirty || mutating}
                >
                  Discard changes
                </Button>
                <Button type="submit" loading={mutating} disabled={uploading}>
                  Save
                </Button>
              </Group>
            </Stack>
          </Grid.Col>
        </Grid>
      </Form>
    </Container>
  );
}
