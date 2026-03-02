<script setup lang="ts">
/**
 * Компонент модального окна для детального просмотра цитаты из книги.
 * Позволяет прочитать полный текст фрагмента и скопировать его в буфер обмена.
 */
const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  /** Текст цитаты */
  text: string;
  /** Заголовок главы, к которой относится цитата */
  chapterTitle?: string;
  /** Номер страницы, на которой находится цитата */
  pageNumber?: number;
}>();

defineEmits<{
  /** Событие закрытия модального окна */
  close: [];
}>();

/**
 * Копирует текст цитаты в буфер обмена.
 */
async function copyCitationToClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
    toast.add({
      title: t("chat.copyCitationSuccess"),
      color: "success",
      icon: "i-lucide-check",
    });
  } catch (err: unknown) {
    console.error("Failed to copy citation to clipboard:", err);
    toast.add({
      title: t("library.statusError"),
      description: String(err),
      color: "error",
      icon: "i-lucide-x",
    });
  }
}
</script>

<template>
  <UModal
    :title="chapterTitle || t('chat.untitledChapter')"
    :description="pageNumber ? `${t('library.columnPage')} ${pageNumber}` : t('chat.citationLabel')"
    :ui="{
      content: 'sm:max-w-2xl',
    }"
  >
    <template #body>
      <div class="relative group">
        <div
          class="bg-muted/10 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap border border-default/50 max-h-[60vh] overflow-y-auto"
        >
          {{ text }}
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end w-full gap-3">
        <UButton
          color="primary"
          icon="i-lucide-copy"
          :label="t('chat.copyCitation')"
          @click="copyCitationToClipboard"
        />
      </div>
    </template>
  </UModal>
</template>
