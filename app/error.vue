<script setup lang="ts">
import type { NuxtError } from "#app";

/**
 * Глобальный компонент обработки ошибок.
 * Обеспечивает отображение страницы ошибки при 404 или системных сбоях.
 */

interface ErrorProperties {
  error: NuxtError;
}

const properties = defineProps<ErrorProperties>();
const { t: translate } = useI18n();

/**
 * Обработка сброса ошибки и перенаправление на главную страницу.
 */
const resetAndRedirectHome = () => clearError({ redirect: "/" });

/**
 * Динамическое определение заголовка сообщения об ошибке на основе статус-кода.
 */
const localizedStatusTitle = computed<string>(() => {
  if (properties.error?.statusCode === 404) {
    return translate("error.pageNotFoundTitle");
  }
  return translate("error.internalServerErrorTitle");
});

/**
 * Формирование детального описания ошибки для пользователя.
 */
const localizedDetailedMessage = computed<string>(() => {
  if (properties.error?.statusCode === 404) {
    return translate("error.pageNotFoundDetail");
  }

  // Если есть специфическое сообщение об ошибке, отличное от стандартного статуса - выводим его
  if (
    properties.error?.message &&
    properties.error.message !== properties.error.statusMessage
  ) {
    return properties.error.message;
  }

  return translate("error.internalServerErrorDetail");
});
</script>

<template>
  <UApp>
    <UError
      :error="{
        ...error,
        statusMessage: localizedStatusTitle,
        message: localizedDetailedMessage,
      }"
      :clear="{
        label: translate('error.backToHomeButton'),
        variant: 'subtle',
      }"
      @clear="resetAndRedirectHome"
    />
  </UApp>
</template>
