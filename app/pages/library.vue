<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { formatBytes } from "~/utils/formatBytes";
import { LazyModalBookDetails, LazyModalBookUpload } from "#components";

interface BookRecord {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  blobUrl: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
  vectorized: boolean;
}

const { t } = useI18n();
const overlay = useOverlay();

const { data: booksData, refresh } = await useFetch("/api/books");
const books = computed(() => booksData.value?.books || []);

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

function openBookDetails(book: BookRecord) {
  const modal = overlay.create(LazyModalBookDetails, {
    props: {
      book,
      onClose: () => modal.close(),
      onDeleted: () => {
        modal.close();
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
          class="p-4 sm:p-6 w-full max-w-7xl mx-auto flex flex-col gap-6"
        >
          <div class="sm:hidden flex justify-between items-center mb-2">
            <h1 class="text-2xl font-bold text-highlighted">
              {{ t("library.title") }}
            </h1>
            <UButton
              :label="t('library.uploadBook')"
              icon="i-lucide-upload"
              size="sm"
              @click="openUploadModal"
            />
          </div>

          <p class="text-muted mb-4 sm:hidden">
            {{ t("library.description") }}
          </p>

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
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
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
                  class="w-full h-40 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center pb-0"
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
                <div
                  class="flex items-center justify-between text-xs text-muted w-full pt-2"
                >
                  <span>{{ formatBytes(book.fileSize) }}</span>
                  <UBadge
                    :color="book.vectorized ? 'success' : 'warning'"
                    variant="subtle"
                    size="sm"
                  >
                    {{
                      book.vectorized
                        ? t("library.processed")
                        : t("library.pending")
                    }}
                  </UBadge>
                </div>
              </template>
            </UPageCard>
          </div>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
