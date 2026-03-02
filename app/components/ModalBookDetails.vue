<script setup lang="ts">
/**
 * Компонент модального окна для просмотра и редактирования деталей книги.
 * Позволяет изменять метаданные книги (название, автор, обложка) и удалять книгу из библиотеки.
 */
import { useMediaQuery } from "@vueuse/core";
import { formatBytes } from "~/utils/formatBytes";
import type { Book } from "~~/shared/types/book";
import { LazyModalConfirm } from "#components";

const { t } = useI18n();

const props = defineProps<{
  /** Объект книги с ее данными */
  book: Book;
  /** Является ли текущий пользователь владельцем книги */
  isOwner?: boolean;
}>();

const emit = defineEmits<{
  /** Событие закрытия модального окна */
  close: [];
  /** Событие после успешного удаления книги */
  deleted: [bookId: string];
  /** Событие после успешного обновления метаданных книги */
  updated: [book: { id: string; title: string; author: string }];
}>();

const toast = useToast();
const overlay = useOverlay();

const isDeleting = ref(false);
const isUpdating = ref(false);
const isEditing = ref(false);

/** Форма для редактирования метаданных книги */
const editForm = ref({
  title: props.book.title,
  author: props.book.author,
  coverUrl: props.book.coverUrl,
});

/** Переключение в режим редактирования */
function startEditing(): void {
  editForm.value = {
    title: props.book.title,
    author: props.book.author,
    coverUrl: props.book.coverUrl,
  };
  isEditing.value = true;
}

/** Отмена редактирования */
function cancelEditing(): void {
  isEditing.value = false;
}

/** Сохранение измененных метаданных на сервере */
async function saveMetadata(): Promise<void> {
  isUpdating.value = true;
  try {
    await $fetch(`/api/books/${props.book.id}`, {
      method: "PATCH",
      body: editForm.value,
    });
    toast.add({ title: t("library.updateSuccessMessage"), color: "success" });
    isEditing.value = false;
    // Уведомляем родительский компонент об изменениях
    emit("updated", { id: props.book.id, ...editForm.value });
  } catch (err: unknown) {
    const error = err as { data?: { message?: string }; message?: string };
    console.error("Failed to update book metadata:", err);
    toast.add({
      title: t("library.statusError"),
      description: error.data?.message || error.message,
      color: "error",
    });
  } finally {
    isUpdating.value = false;
  }
}

/** Удаление книги после подтверждения */
async function deleteBook(): Promise<void> {
  // Создаем и открываем модальное окно подтверждения
  const confirmModal = overlay.create(LazyModalConfirm, {
    props: {
      title: t("library.deleteBookTitle"),
      description: t("library.deleteBookConfirm"),
    },
  });
  
  const userConfirmed = await confirmModal.open();
  if (!userConfirmed) return;

  isDeleting.value = true;
  try {
    await $fetch(`/api/books/${props.book.id}`, { method: "DELETE" });
    toast.add({ title: t("library.deleteBookSuccess"), color: "success" });
    emit("deleted", props.book.id);
    emit("close");
  } catch (err: unknown) {
    const error = err as { data?: { message?: string }; message?: string };
    console.error("Failed to delete book:", err);
    toast.add({
      title: t("library.statusError"),
      description: error.data?.message || error.message,
      color: "error",
    });
  } finally {
    isDeleting.value = false;
  }
}

/** Форматированная дата загрузки книги */
const uploadDate = computed(() => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(props.book.uploadedAt));
});

const isMobile = useMediaQuery("(max-width: 640px)");

/** Переход к чату с выбранной книгой */
function startChat(): void {
  navigateTo({
    path: "/",
    query: { bookId: props.book.id },
  });
  emit("close");
}
</script>

<template>
  <UModal
    :title="isEditing ? t('library.editBookTitle') : book.title"
    :description="isEditing ? '' : book.author"
    :ui="{
      footer: 'flex items-center w-full gap-2 overflow-x-auto no-scrollbar py-3',
    }"
    :fullscreen="isMobile"
  >
    <template #body>
      <div v-if="isEditing" class="flex flex-col gap-4">
        <div
          v-if="editForm.coverUrl"
          class="w-full aspect-2/3 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0"
        >
          <img
            :src="editForm.coverUrl"
            :alt="editForm.title"
            class="w-full h-full object-cover"
          >
        </div>

        <UFormField :label="t('library.bookTitleLabel')">
          <UInput v-model="editForm.title" class="w-full" autofocus />
        </UFormField>
        <UFormField :label="t('library.columnAuthor')">
          <UInput v-model="editForm.author" class="w-full" />
        </UFormField>
        <UFormField :label="t('library.coverUrlLabel')">
          <UInput v-model="editForm.coverUrl" class="w-full" placeholder="https://..." />
        </UFormField>
      </div>
      <div v-else class="flex flex-col gap-4">
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
            <span class="text-muted block mb-1">{{ t("library.columnSize") }}</span>
            <span class="font-medium">{{ formatBytes(book.fileSize) }}</span>
          </div>
          <div>
            <span class="text-muted block mb-1">{{
              t("library.columnUploadedAt")
            }}</span>
            <span class="font-medium">{{ uploadDate }}</span>
          </div>
          <div class="col-span-2">
            <span class="text-muted block mb-1">{{ t("library.columnStatus") }}</span>
            <UBadge
              :color="book.vectorized ? 'success' : 'warning'"
              variant="subtle"
            >
              {{
                book.vectorized ? t("library.statusProcessed") : t("library.statusPending")
              }}
            </UBadge>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="isEditing">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('chat.cancelButton')"
          class="shrink-0"
          @click="cancelEditing"
        />
        <UButton
          color="primary"
          icon="i-lucide-check"
          :label="t('library.saveButton')"
          :loading="isUpdating"
          class="shrink-0 ml-auto"
          @click="saveMetadata"
        />
      </template>
      <template v-else>
        <UButton
          :label="t('library.startChatButton')"
          icon="i-lucide-message-circle"
          class="shrink-0"
          @click="startChat"
        />
        <UButton
          v-if="isOwner"
          color="neutral"
          variant="soft"
          icon="i-lucide-pencil"
          :label="t('library.editButton')"
          class="shrink-0"
          @click="startEditing"
        />
        <UButton
          v-if="isOwner"
          color="error"
          variant="soft"
          icon="i-lucide-trash"
          :label="t('library.deleteButton')"
          :loading="isDeleting"
          class="shrink-0"
          @click="deleteBook"
        />
      </template>
    </template>
  </UModal>
</template>
