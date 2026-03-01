<script setup lang="ts">
const { t } = useI18n();

const input = ref("");
const loading = ref(false);

const { data: booksData } = await useFetch("/api/books");
const books = computed(() => booksData.value?.books || []);
const selectedBook = ref();

async function createChat(prompt: string) {
  input.value = prompt;
  loading.value = true;

  const chatId = crypto.randomUUID();

  const chat = await $fetch("/api/chat", {
    method: "POST",
    body: {
      query: prompt,
      bookIds: selectedBook.value ? [selectedBook.value.id] : [],
      chatId: undefined,
    },
  }).catch(() => null);

  // Even if the streaming request fails,
  // we navigate to the chat page — the chat was created server-side
  // before the LLM call, so it should exist.
  refreshNuxtData("chats");
  navigateTo(`/chat/${chatId}`);
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
                  label-key="title"
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
