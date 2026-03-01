<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { formatBytes } from "~/utils/formatBytes";

interface BookRecord {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  blobUrl: string;
  filename: string;
  fileSize: number;
  uploadedAt: string | number;
  vectorized: boolean;
}

const { t } = useI18n();

const props = defineProps<{
  book: BookRecord;
}>();

const emit = defineEmits<{
  close: [];
  deleted: [bookId: string];
}>();

const toast = useToast();
const isDeleting = ref(false);

async function deleteBook() {
  if (!window.confirm(t("library.deleteConfirm"))) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/books/${props.book.id}`, { method: "DELETE" });
    toast.add({ title: t("library.deleteSuccess"), color: "success" });
    emit("deleted", props.book.id);
  } catch (err: unknown) {
    const error = err as { data?: { message?: string }; message?: string };
    toast.add({
      title: t("library.error"),
      description: error.data?.message || error.message,
      color: "error",
    });
  } finally {
    isDeleting.value = false;
  }
}

const uploadDate = computed(() => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(props.book.uploadedAt));
});

const isMobile = useMediaQuery("(max-width: 640px)");

function startChat() {
  // Navigate to index with this book selected.
  // In the current setup we might just go to '/' but ideally we pass the book ID.
  navigateTo({
    path: "/",
    query: { bookId: props.book.id },
  });
  emit("close");
}
</script>

<template>
  <UModal
    :title="book.title"
    :description="book.author"
    :ui="{
      footer: 'flex justify-between items-center w-full gap-2',
    }"
    :fullscreen="isMobile"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div
          v-if="book.coverUrl"
          class="w-full aspect-2/3 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0"
        >
          <img
            :src="book.coverUrl"
            :alt="book.title"
            class="w-full h-full object-cover"
          >
        </div>

        <div class="grid grid-cols-2 gap-4 text-sm mt-2">
          <div>
            <span class="text-muted block mb-1">{{ t("library.size") }}</span>
            <span class="font-medium">{{ formatBytes(book.fileSize) }}</span>
          </div>
          <div>
            <span class="text-muted block mb-1">{{
              t("library.uploaded")
            }}</span>
            <span class="font-medium">{{ uploadDate }}</span>
          </div>
          <div class="col-span-2">
            <span class="text-muted block mb-1">{{ t("library.status") }}</span>
            <UBadge
              :color="book.vectorized ? 'success' : 'warning'"
              variant="subtle"
            >
              {{
                book.vectorized ? t("library.processed") : t("library.pending")
              }}
            </UBadge>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        color="error"
        variant="soft"
        icon="i-lucide-trash"
        :label="t('library.deleteBook')"
        :loading="isDeleting"
        @click="deleteBook"
      />
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('library.close')"
          @click="emit('close')"
        />
        <UButton
          :label="t('library.startChat')"
          icon="i-lucide-message-circle"
          @click="startChat"
        />
      </div>
    </template>
  </UModal>
</template>
