<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
const { t } = useI18n();
const toast = useToast();

const emit = defineEmits<{ close: [] }>();

const file = ref<File | null>(null);
const title = ref("");
const author = ref("");
const coverUrl = ref("");
const loading = ref(false);

const isMobile = useMediaQuery("(max-width: 640px)");

// Auto-fill title from filename if nothing is typed yet
watch(file, (newFile) => {
  const actualFile =
    Array.isArray(newFile) || newFile instanceof FileList
      ? newFile[0]
      : newFile;
  if (actualFile && !title.value) {
    title.value = actualFile.name.replace(/\.[^/.]+$/, "");
  }
});

async function uploadFile() {
  if (!file.value) return;
  // Handle both single File and Array/FileList cases correctly
  const currentFile =
    Array.isArray(file.value) || file.value instanceof FileList
      ? file.value[0]
      : file.value;

  if (!currentFile) return;

  loading.value = true;
  const formData = new FormData();
  formData.append("file", currentFile);
  if (title.value) formData.append("title", title.value);
  if (author.value) formData.append("author", author.value);
  if (coverUrl.value) formData.append("coverUrl", coverUrl.value);

  try {
    const uploadRes = await $fetch<{ status: string; blob: { url: string } }>(
      "/api/books/upload",
      {
        method: "POST",
        body: formData,
      },
    );

    // Trigger vectorization immediately after successful upload
    toast.add({
      title: t("library.uploadSuccessMessage"),
      icon: "i-lucide-check-circle",
    });

    // We send to vectorize API. Background job will handle the rest.
    toast.add({
      title: t("library.statusVectorizing"),
      description: currentFile.name,
      icon: "i-lucide-loader-2",
    });
    await $fetch("/api/books/vectorize", {
      method: "POST",
      body: {
        blobUrl: uploadRes.blob.url,
        bookName: title.value || currentFile.name,
        author: author.value,
      },
    });

    emit("close");
  } catch (err: unknown) {
    const error = err as { message?: string };
    toast.add({
      title: t("library.statusError"),
      description: error.message || "Upload failed",
      color: "error",
      icon: "i-lucide-alert-circle",
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UModal :title="t('library.uploadModalTitle')" :fullscreen="isMobile">
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="uploadFile">
        <UFormField :label="t('library.fileLabel')" required>
          <UFileUpload
            v-model="file"
            accept=".pdf,.txt,.epub"
            :label="t('library.dropzoneMainLabel')"
            :description="t('library.dropzoneDescription')"
            icon="i-lucide-upload-cloud"
            class="w-full"
            :max-files="1"
            :disabled="loading"
          />
        </UFormField>

        <UFormField :label="t('library.bookTitleLabel')">
          <UInput
            v-model="title"
            :placeholder="t('library.bookTitleLabel')"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('library.columnAuthor')">
          <UInput
            v-model="author"
            :placeholder="t('library.columnAuthor')"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('library.coverUrlLabel')">
          <UInput
            v-model="coverUrl"
            type="url"
            :placeholder="t('library.coverUrlLabel')"
            :disabled="loading"
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
          :disabled="loading"
          @click="emit('close')"
        />
        <UButton
          type="button"
          :label="t('library.uploadSubmitButton')"
          icon="i-lucide-upload"
          :loading="loading"
          :disabled="!file"
          @click="uploadFile"
        />
      </div>
    </template>
  </UModal>
</template>
