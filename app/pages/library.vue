<script setup lang="ts">
import type { Book } from "../../shared/types/book";
import { useMediaQuery } from "@vueuse/core";
import { formatBytes } from "~/utils/formatBytes";
import { LazyModalBookDetails, LazyModalBookUpload } from "#components";

/**
 * Страница библиотеки книг пользователя.
 * Позволяет просматривать список загруженных книг, их статус обработки и загружать новые.
 */

const { t } = useI18n();
const modalOverlay = useOverlay();

// Получение данных о книгах и текущем пользователе
const { data: libraryData, refresh: refreshLibrary } = await useFetch<{
  books: Book[];
  currentUserId: string;
  isAdmin: boolean;
}>("/api/books", {
  key: "library-books-data",
});

const allBooks = computed(() => libraryData.value?.books ?? []);
const authenticatedUserId = computed(() => libraryData.value?.currentUserId);
const hasAdminPrivileges = computed(() => libraryData.value?.isAdmin === true);

// Состояние активного опроса для обновления прогресса векторизации
const isFastPollingActive = ref(false);
let libraryUpdateTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Настраивает интервальный опрос API для получения свежего списка книг.
 * @param intervalMs Интервал опроса в миллисекундах.
 */
function setupLibraryPolling(intervalMs: number) {
  if (!import.meta.client) return;

  if (libraryUpdateTimer) {
    clearInterval(libraryUpdateTimer);
  }

  libraryUpdateTimer = setInterval(() => {
    // Опрашиваем только если вкладка активна
    if (document.visibilityState === "visible") {
      refreshLibrary();
    }
  }, intervalMs);
}

// Константы интервалов опроса
const POLLING_INTERVAL_FAST = 5000;   // 5 секунд при активной обработке
const POLLING_INTERVAL_SLOW = 30000;  // 30 секунд в обычном режиме

// Отслеживание необходимости ускоренного опроса (если есть книги в процессе обработки)
watch(
  () => allBooks.value,
  (books) => {
    const hasActiveJobs = books.some(
      (book) =>
        !book.vectorized &&
        book.job &&
        (book.job.status === "processing" || book.job.status === "pending"),
    );

    if (hasActiveJobs && !isFastPollingActive.value) {
      // Переключаемся на быстрый опрос, если появились активные задачи
      setupLibraryPolling(POLLING_INTERVAL_FAST);
      isFastPollingActive.value = true;
    } else if (!hasActiveJobs && isFastPollingActive.value) {
      // Возвращаемся к медленному опросу, если все задачи завершены
      setupLibraryPolling(POLLING_INTERVAL_SLOW);
      isFastPollingActive.value = false;
    }
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  // Инициализация фонового опроса при загрузке страницы
  if (!isFastPollingActive.value) {
    setupLibraryPolling(POLLING_INTERVAL_SLOW);
  }
});

onUnmounted(() => {
  if (libraryUpdateTimer) {
    clearInterval(libraryUpdateTimer);
  }
});

/**
 * Открывает модальное окно для загрузки новой книги.
 */
function showUploadModal() {
  const uploadModal = modalOverlay.create(LazyModalBookUpload, {
    props: {
      onClose: () => {
        uploadModal.close();
        refreshLibrary();
      },
    },
  });
  uploadModal.open();
}

/**
 * Открывает модальное окно с детальной информацией о книге.
 * @param targetBook Объект книги для отображения.
 */
function showBookDetailsModal(targetBook: Book) {
  const detailsModal = modalOverlay.create(LazyModalBookDetails, {
    props: {
      book: targetBook,
      isOwner: hasAdminPrivileges.value || targetBook.userId === authenticatedUserId.value,
      onClose: () => detailsModal.close(),
      onDeleted: () => {
        detailsModal.close();
        refreshLibrary();
      },
      onUpdated: () => {
        refreshLibrary();
      },
    },
  });
  detailsModal.open();
}
</script>

<template>
  <UDashboardPanel id="library" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <DashboardNavbar>
        <template #left-aligned>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-highlighted">
              {{ t("library.mainTitle") }}
            </h1>
          </div>
        </template>

        <template #right-aligned>
          <UButton
            v-if="!useMediaQuery('(max-width: 1024px)').value"
            :label="t('library.uploadBookButton')"
            icon="i-lucide-upload"
            @click="showUploadModal"
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
              :label="t('library.uploadBookButton')"
              icon="i-lucide-upload"
              size="sm"
              @click="showUploadModal"
            />
          </div>

          <div
            v-if="allBooks.length === 0"
            class="flex flex-col items-center justify-center py-20 text-center"
          >
            <UIcon
              name="i-lucide-library"
              class="size-16 text-muted mb-4 opacity-50"
            />
            <h3 class="text-lg font-medium text-highlighted mb-1">
              {{ t("chat.noBooksFound") }}
            </h3>
            <p class="text-muted mb-4">{{ t("library.mainDescription") }}</p>
            <UButton
              :label="t('library.uploadModalTitle')"
              icon="i-lucide-upload"
              @click="showUploadModal"
            />
          </div>

          <div
            v-else
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6"
          >
            <UPageCard
              v-for="book in allBooks"
              :key="book.id"
              :title="book.title"
              :description="book.author"
              class="cursor-pointer hover:ring-2 hover:ring-primary transition-all overflow-hidden flex flex-col"
              @click="showBookDetailsModal(book)"
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
                      <span>{{ t("library.statusProcessing") }}</span>
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
                          ? t("library.statusProcessed")
                          : book.job?.status === "processing"
                            ? t("library.statusProcessing")
                            : book.job?.status === "pending"
                              ? t("library.statusPending")
                              : t("library.statusWaiting")
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
