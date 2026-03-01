<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps<{
  error: NuxtError;
}>();

const { t } = useI18n();

const handleError = () => clearError({ redirect: "/" });

const statusMessage = computed(() => {
  if (props.error?.statusCode === 404) return t("error.notFound");
  return t("error.internalServerError");
});

const message = computed(() => {
  if (props.error?.statusCode === 404) return t("error.notFoundDetail");

  if (
    props.error?.message &&
    props.error.message !== props.error.statusMessage
  ) {
    return props.error.message;
  }

  return t("error.internalServerErrorDetail");
});
</script>

<template>
  <UApp>
    <UError
      :error="{
        ...error,
        statusMessage,
        message,
      }"
      :clear="{
        label: t('error.backToHome'),
        variant: 'subtle',
      }"
      @clear="handleError"
    />
  </UApp>
</template>
