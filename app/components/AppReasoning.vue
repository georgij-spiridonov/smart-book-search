<script setup lang="ts">
/**
 * Компонент для отображения процесса "размышления" или работы конвейера обработки (pipeline).
 * Позволяет пользователю видеть детали того, как ИИ пришел к ответу.
 */
const { t } = useI18n();

// Определение входных параметров
const { isStreaming = false } = defineProps<{
  /** Текст с описанием процесса работы */
  text: string;
  /** Флаг, указывающий на то, идет ли процесс генерации в данный момент */
  isStreaming?: boolean;
}>();

const isExpanded = ref(false);

// Автоматически раскрываем блок, если идет стриминг
watch(
  () => isStreaming,
  (newVal) => {
    isExpanded.value = newVal;
  },
  { immediate: true },
);

/**
 * Очищает текст от базовой разметки Markdown для более чистого отображения в логах.
 * @param markdown Текст с разметкой.
 * @returns Очищенный текст.
 */
function removeMarkdownFormatting(markdown: string): string {
  if (!markdown) return "";
  
  return markdown
    .replace(/(\*\*|\*|`|#+\s+)/g, ""); // Удаляем жирный, курсив, код и заголовки одним регулярным выражением
}
</script>

<template>
  <UCollapsible v-model:open="isExpanded" class="flex flex-col gap-1 my-5">
    <UButton
      class="p-0 group"
      color="neutral"
      variant="link"
      icon="i-lucide-activity"
      trailing-icon="i-lucide-chevron-down"
      :ui="{
        trailingIcon:
          text.length > 0
            ? 'group-data-[state=open]:rotate-180 transition-transform duration-200'
            : 'hidden',
      }"
      :label="isStreaming ? t('chat.processingMessage') : t('chat.viewPipelineDetails')"
    />

    <template #content>
      <div
        v-for="(line, index) in removeMarkdownFormatting(text)
          .split('\n')
          .filter(Boolean)"
        :key="index"
      >
        <span class="whitespace-pre-wrap text-sm text-muted font-normal">{{
          line
        }}</span>
      </div>
    </template>
  </UCollapsible>
</template>
