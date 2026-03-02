<script setup lang="ts">
import type { Book } from "../../shared/types/book";

const { t } = useI18n();
const route = useRoute();
const toast = useToast();

const input = ref("");
const loading = ref(false);

const { data: booksData } = await useFetch<{ books: Book[] }>("/api/books", {
  key: "books",
});
const books = computed(() => (booksData.value?.books || []).map((b) => ({
  ...b,
  label: b.author ? `${b.author} / ${b.title}` : b.title,
})));
const selectedBook = ref(books.value.find((b) => b.id === route.query.bookId));

async function createChat(prompt: string) {
  if (!selectedBook.value) {
    toast.add({
      title: t("chat.selectBookError"),
      icon: "i-lucide-alert-circle",
      color: "error",
    });
    return;
  }

  input.value = prompt;
  loading.value = true;

  const chat = await $fetch("/api/chats", {
    method: "POST",
    body: {
      bookIds: selectedBook.value ? [selectedBook.value.id] : [],
    },
  }).catch(() => null);

  if (chat) {
    refreshNuxtData("chats");
    navigateTo(`/chat/${chat.id}?prompt=${encodeURIComponent(prompt)}`);
  } else {
    loading.value = false;
  }
}

async function onSubmit() {
  if (!input.value.trim()) return;
  await createChat(input.value);
}
</script>

<template>
  <UDashboardPanel id="home" class="min-h-0" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <div class="flex flex-1">
        <UContainer
          class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8"
        >
          <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
            {{ t("chat.welcome") }}
          </h1>

          <UChatPrompt
            v-model="input"
            :placeholder="t('chat.placeholder')"
            :status="loading ? 'streaming' : 'ready'"
            class="[view-transition-name:chat-prompt]"
            variant="subtle"
            :ui="{ base: 'px-1.5' }"
            @submit="onSubmit"
          >
            <template #footer>
              <div class="flex items-center gap-1">
                <USelectMenu
                  v-model="selectedBook"
                  :items="books"
                  label-key="label"
                  :placeholder="t('chat.selectBook')"
                  :search-input="{ placeholder: t('chat.searchBooks') }"
                  class="max-w-64"
                  variant="ghost"
                  size="sm"
                  color="neutral"
                >
                  <template #leading>
                    <UIcon name="i-lucide-book" class="size-4" />
                  </template>

                  <template #item="{ item }">
                    <span class="truncate">{{ item.title }}</span>
                  </template>

                  <template #empty="{ searchTerm }">
                    <span v-if="searchTerm">{{
                      t("chat.noMatchingBooks")
                    }}</span>
                    <span v-else>{{ t("chat.noBooks") }}</span>
                  </template>
                </USelectMenu>
              </div>

              <UChatPromptSubmit color="neutral" size="sm" />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
