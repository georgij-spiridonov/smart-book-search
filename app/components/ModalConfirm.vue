<script setup lang="ts">
/**
 * Компонент модального окна подтверждения действия.
 * Используется для запроса подтверждения у пользователя перед выполнением необратимых операций.
 */

const { t } = useI18n();

// Определение входных параметров компонента
defineProps<{
  /** Заголовок модального окна */
  title: string;
  /** Описание подтверждаемого действия */
  description: string;
}>();

/**
 * События компонента:
 * close - вызывается при закрытии окна, передает true (подтверждено) или false (отменено)
 */
const emit = defineEmits<{ 
  close: [confirmed: boolean] 
}>();

/**
 * Обработка выбора пользователя
 * @param confirmed Результат выбора: true — подтвердить, false — отменить
 */
function handleUserAction(confirmed: boolean): void {
  emit('close', confirmed);
}
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :ui="{
      footer: 'flex-row-reverse justify-start',
    }"
    :close="false"
    :dismissible="false"
  >
    <template #footer>
      <UButton 
        :label="t('chat.deleteButton')" 
        @click="handleUserAction(true)" 
      />
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('chat.cancelButton')"
        @click="handleUserAction(false)"
      />
    </template>
  </UModal>
</template>
