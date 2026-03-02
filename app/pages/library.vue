<script setup lang="ts">
import type { Book } from "../../shared/types/book";
import { useMediaQuery } from "@vueuse/core";
import { formatBytes } from "~/utils/formatBytes";
import { LazyModalBookDetails, LazyModalBookUpload } from "#components";

const { t } = useI18n();
const overlay = useOverlay();

const { data: booksData, refresh } = await useFetch<{
  books: Book[];
  currentUserId: string;
  isAdmin: boolean;
}>("/api/books", {
  key: "books",
});
const books = computed(() => booksData.value?.books || []);
const currentUserId = computed(() => booksData.value?.currentUserId);
const isAdminUser = computed(() => booksData.value?.isAdmin === true);

// Adaptive polling for book status/progress updates
const pollingActive = ref(false);
let timer: NodeJS.Timeout | null = null;

function startPolling(interval: number) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  }, interval);
}

// Watch for books that need active monitoring (processing or pending)
watch(
  () => books.value,
  (newBooks) => {
    const hasActiveJobs = newBooks.some(
      (b) =>
        !b.vectorized &&
        b.job &&
        (b.job.status === "processing" || b.job.status === "pending"),
    );

    if (hasActiveJobs) {
      // If there are active jobs, poll every 5 seconds
      startPolling(5000);
      pollingActive.value = true;
    } else if (pollingActive.value) {
      // If no active jobs, but we were in "fast mode", slow down to 30s
      startPolling(30000);
      pollingActive.value = false;
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  // Initial slow poll for background updates
  if (!pollingActive.value) {
    startPolling(30000);
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function openUploadModal() {
  const modal = overlay.create(LazyModalBookUpload, {
    props: {
      onClose: () => {
        modal.close();
        refresh(); // refresh list after potential upload
      },
    },
  });
  modal.open();
}

function openBookDetails(book: Book) {
  const modal = overlay.create(LazyModalBookDetails, {
    props: {
      book,
      isOwner: isAdminUser.value || book.userId === currentUserId.value,
      onClose: () => modal.close(),
      onDeleted: () => {
        modal.close();
        refresh();
      },
      onUpdated: () => {
        refresh();
      },
    },
  });
  modal.open();
}
</script>

<template>
  <UDashboardPanel id="library" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <!-- We can use the DashboardNavbar and add a specific title or actions -->
      <DashboardNavbar>
        <template #left-aligned>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-highlighted">
              {{ t("library.title") }}
            </h1>
          </div>
        </template>

        <template #right-aligned>
          <UButton
            v-if="!useMediaQuery('(max-width: 1024px)').value"
            :label="t('library.uploadBook')"
            icon="i-lucide-upload"
            @click="openUploadModal"
          />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col overflow-y-auto">
        <UContainer
          class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:pb-8 lg:pt-(--ui-header-height) w-full max-w-none flex flex-col gap-6"
        >
          <div class="sm:hidden flex justify-end items-center mb-2">
            <UButton
              :label="t('library.uploadBook')"
              icon="i-lucide-upload"
              size="sm"
              @click="openUploadModal"
            />
          </div>

          <div
            v-if="books.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center"
          >
            <UIcon
              name="i-lucide-library"
              class="size-16 text-muted mb-4 opacity-50"
            />
            <h3 class="text-lg font-medium text-highlighted mb-1">
              {{ t("chat.noBooks") }}
            </h3>
            <p class="text-muted mb-4">{{ t("library.description") }}</p>
            <UButton
              :label="t('library.uploadNew')"
              icon="i-lucide-upload"
              @click="openUploadModal"
            />
          </div>

          <div
            v-else
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6"
          >
            <UPageCard
              v-for="book in books"
              :key="book.id"
              :title="book.title"
              :description="book.author"
              class="cursor-pointer hover:ring-2 hover:ring-primary transition-all overflow-hidden flex flex-col"
              @click="openBookDetails(book)"
            >
              <template #header>
                <div
                  class="w-full aspect-2/3 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center pb-0 rounded-md overflow-hidden"
                >
                  <img
                    v-if="book.coverUrl"
                    :src="book.coverUrl"
                    :alt="book.title"
                    class="w-full h-full object-cover"
                  >
                  <UIcon
                    v-else
                    name="i-lucide-book"
                    class="size-12 text-muted opacity-50"
                  />
                </div>
              </template>

              <template #footer>
                <div class="flex flex-col w-full gap-2 pt-2">
                  <div
                    v-if="book.job && book.job.status === 'processing'"
                    class="w-full space-y-1"
                  >
                    <div class="flex justify-between text-[10px] text-muted">
                      <span>{{ t("library.processing") }}</span>
                      <span>{{
                        Math.round(
                          (book.job.progress.chunksProcessed /
                            book.job.progress.totalChunks) *
                            100,
                        ) || 0
                      }}%</span>
                    </div>
                    <UProgress
                      :value="book.job.progress.chunksProcessed"
                      :max="book.job.progress.totalChunks"
                      size="xs"
                      color="primary"
                    />
                  </div>

                  <div
                    class="flex items-center justify-between text-xs text-muted w-full gap-2"
                  >
                    <span class="shrink-0">{{
                      formatBytes(book.fileSize)
                    }}</span>
                    <UBadge
                      :color="
                        book.vectorized
                          ? 'success'
                          : book.job?.status === 'processing' ||
                              book.job?.status === 'pending'
                            ? 'primary'
                            : 'warning'
                      "
                      variant="subtle"
                      size="sm"
                      class="truncate"
                    >
                      {{
                        book.vectorized
                          ? t("library.processed")
                          : book.job?.status === "processing"
                            ? t("library.processing")
                            : book.job?.status === "pending"
                              ? t("library.pending")
                              : t("library.waiting")
                      }}
                    </UBadge>
                  </div>
                </div>
              </template>
            </UPageCard>
          </div>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
