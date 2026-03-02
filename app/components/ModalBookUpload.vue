<script setup lang="ts">
/**
 * Компонент модального окна для загрузки новых книг в библиотеку.
 * Поддерживает форматы .pdf, .txt, .epub и автоматически запускает процесс векторизации после загрузки.
 */
import { useMediaQuery } from "@vueuse/core";

const { t } = useI18n();
const toast = useToast();

const emit = defineEmits<{ 
  /** Событие закрытия модального окна */
  close: [] 
}>();

/** Состояние формы загрузки */
const selectedFile = ref<File | null>(null);
const bookTitle = ref("");
const bookAuthor = ref("");
const bookCoverUrl = ref("");
const isUploading = ref(false);

const isMobile = useMediaQuery("(max-width: 640px)");

// Автоматическое заполнение названия книги из имени файла
watch(selectedFile, (newFile) => {
  const file = Array.isArray(newFile) ? newFile[0] : newFile;
  if (file && !bookTitle.value) {
    // Удаляем расширение файла для названия
    bookTitle.value = file.name.replace(/\.[^/.]+$/, "");
  }
});

/**
 * Выполняет загрузку файла и метаданных на сервер.
 */
async function handleFileUpload(): Promise<void> {
  const fileToUpload = Array.isArray(selectedFile.value) 
    ? selectedFile.value[0] 
    : selectedFile.value;

  if (!fileToUpload) return;

  isUploading.value = true;
  const formData = new FormData();
  formData.append("file", fileToUpload);
  
  if (bookTitle.value) formData.append("title", bookTitle.value);
  if (bookAuthor.value) formData.append("author", bookAuthor.value);
  if (bookCoverUrl.value) formData.append("coverUrl", bookCoverUrl.value);

  try {
    // 1. Загрузка файла
    const uploadResponse = await $fetch<{ status: string; blob: { url: string } }>(
      "/api/books/upload",
      {
        method: "POST",
        body: formData,
      },
    );

    toast.add({
      title: t("library.uploadSuccessMessage"),
      icon: "i-lucide-check-circle",
      color: "success"
    });

    // 2. Запуск процесса векторизации (извлечение текста и создание эмбеддингов)
    toast.add({
      title: t("library.statusVectorizing"),
      description: fileToUpload.name,
      icon: "i-lucide-loader-2",
    });

    await $fetch("/api/books/vectorize", {
      method: "POST",
      body: {
        blobUrl: uploadResponse.blob.url,
        bookName: bookTitle.value || fileToUpload.name,
        author: bookAuthor.value,
      },
    });

    emit("close");
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error("Upload or vectorization failed:", err);
    toast.add({
      title: t("library.statusError"),
      description: error.message || "Upload failed",
      color: "error",
      icon: "i-lucide-alert-circle",
    });
  } finally {
    isUploading.value = false;
  }
}
</script>

<template>
  <UModal :title="t('library.uploadModalTitle')" :fullscreen="isMobile">
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="handleFileUpload">
        <UFormField :label="t('library.fileLabel')" required>
          <UFileUpload
            v-model="selectedFile"
            accept=".pdf,.txt,.epub"
            :label="t('library.dropzoneMainLabel')"
            :description="t('library.dropzoneDescription')"
            icon="i-lucide-upload-cloud"
            class="w-full"
            :max-files="1"
            :disabled="isUploading"
          />
        </UFormField>

        <UFormField :label="t('library.bookTitleLabel')">
          <UInput
            v-model="bookTitle"
            :placeholder="t('library.bookTitleLabel')"
            :disabled="isUploading"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('library.columnAuthor')">
          <UInput
            v-model="bookAuthor"
            :placeholder="t('library.columnAuthor')"
            :disabled="isUploading"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('library.coverUrlLabel')">
          <UInput
            v-model="bookCoverUrl"
            type="url"
            :placeholder="t('library.coverUrlLabel')"
            :disabled="isUploading"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          type="button"
          color="neutral"
          variant="ghost"
          :label="t('library.closeButton')"
          :disabled="isUploading"
          @click="emit('close')"
        />
        <UButton
          type="button"
          :label="t('library.uploadSubmitButton')"
          icon="i-lucide-upload"
          :loading="isUploading"
          :disabled="!selectedFile"
          @click="handleFileUpload"
        />
      </div>
    </template>
  </UModal>
</template>
