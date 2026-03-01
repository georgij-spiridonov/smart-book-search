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
  if (newFile && !title.value) {
    title.value = newFile.name.replace(/\.[^/.]+$/, "");
  }
});

async function uploadFile() {
  if (!file.value) return;
  const currentFile = file.value;

  loading.value = true;
  const formData = new FormData();
  formData.append("file", currentFile);
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
      title: t("library.uploadSuccess"),
      icon: "i-lucide-check-circle",
    });

    // We send to vectorize API. Background job will handle the rest.
    toast.add({
      title: t("library.vectorizing"),
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
  } catch (err: any) {
    toast.add({
      title: t("library.error"),
      description: err.message || "Upload failed",
      color: "error",
      icon: "i-lucide-alert-circle",
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UModal :title="t('library.uploadNew')" :fullscreen="isMobile">
    <template #body>
      <form @submit.prevent="uploadFile" class="flex flex-col gap-4">
        <UFormField :label="t('library.file')" required>
          <UFileUpload
            v-model="file"
            accept=".pdf,.txt,.epub"
            :label="t('library.dropzoneLabel')"
            :description="t('library.dropzoneDescription')"
            icon="i-lucide-upload-cloud"
            class="w-full"
            :max-files="1"
            :disabled="loading"
          />
        </UFormField>

        <UFormField :label="t('library.uploadTitle')">
          <UInput
            v-model="title"
            :placeholder="t('library.uploadTitle')"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('library.author')">
          <UInput
            v-model="author"
            :placeholder="t('library.author')"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('library.coverUrl')">
          <UInput
            v-model="coverUrl"
            type="url"
            :placeholder="t('library.coverUrl')"
            :disabled="loading"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('library.close')"
          :disabled="loading"
          @click="emit('close')"
        />
        <UButton
          :label="t('library.uploadButton')"
          icon="i-lucide-upload"
          :loading="loading"
          :disabled="!file"
          @click="uploadFile"
        />
      </div>
    </template>
  </UModal>
</template>
