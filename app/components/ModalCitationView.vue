<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();

const props = defineProps<{
  text: string;
  chapterTitle?: string;
  pageNumber?: number;
}>();

defineEmits<{
  close: [];
}>();

function copyCitation() {
  try {
    navigator.clipboard.writeText(props.text);
    toast.add({
      title: t("chat.copySuccess"),
      color: "success",
      icon: "i-lucide-check",
    });
  } catch (err) {
    console.error("Failed to copy citation:", err);
    toast.add({
      title: t("library.error"),
      description: String(err),
      color: "error",
      icon: "i-lucide-x",
    });
  }
}
</script>

<template>
  <UModal
    :title="chapterTitle || t('chat.chapterUntitled')"
    :description="pageNumber ? `${t('library.page')} ${pageNumber}` : t('chat.citation')"
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
          :label="t('chat.copy')"
          @click="copyCitation"
        />
      </div>
    </template>
  </UModal>
</template>
