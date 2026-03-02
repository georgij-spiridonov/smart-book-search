<script setup lang="ts">
import type { DefineComponent } from "vue";
import { Chat } from "@ai-sdk/vue";
import type { UIMessage } from "ai";
import { useClipboard } from "@vueuse/core";
import { getTextFromMessage } from "@nuxt/ui/utils/ai";
import { createBookChatTransport } from "~/utils/BookChatTransport";
import ProseStreamPre from "../../components/prose/PreStream.vue";

const { t } = useI18n();

const components = {
  pre: ProseStreamPre as unknown as DefineComponent,
};

const route = useRoute();
const toast = useToast();
const { copy: clipboardCopy } = useClipboard();

const { data } = await useFetch(
  () => `/api/chats/${route.params.id}`,
  {
    key: `chat-${route.params.id}`,
  },
);

if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: t("chat.notFound") });
}

definePageMeta({
  key: (route) => route.params.id as string,
});

interface Book {
  id: string;
  title: string;
}

const { data: booksData } = await useFetch("/api/books");
const books = computed(() => (booksData.value?.books || []) as Book[]);
const selectedBook = ref<Book | undefined>(undefined);

// Sync selectedBook with chat data
watch(
  [books, data],
  ([newBooks, newData]) => {
    if (newData?.bookIds && newBooks.length) {
      selectedBook.value =
        newBooks.find((b) => newData.bookIds?.includes(b.id)) || undefined;
    }
  },
  { immediate: true },
);

const input = ref("");

const chat = new Chat({
  id: data.value.id,
  messages: data.value.messages as UIMessage[],
  transport: createBookChatTransport(
    computed(() => (selectedBook.value ? [selectedBook.value.id] : [])),
  ),
  onError(error) {
    const { message } =
      typeof error.message === "string" && error.message[0] === "{"
        ? JSON.parse(error.message)
        : error;
    toast.add({
      description: message,
      icon: "i-lucide-alert-circle",
      color: "error",
      duration: 0,
    });
  },
});

async function handleSubmit(e: Event) {
  e.preventDefault();
  if (input.value.trim()) {
    chat.sendMessage({
      text: input.value,
    });
    input.value = "";
  }
}

const copied = ref(false);

function copy(_e: MouseEvent, message: UIMessage) {
  clipboardCopy(getTextFromMessage(message));

  copied.value = true;

  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function getStepParts(message: UIMessage) {
  const steps = message.parts.filter((p) => p.type === "data-step");
  if (!steps.length) return null;

  const lastStep = steps[steps.length - 1] as any;
  return {
    text: steps.map((s: any) => s.data.text).join(""),
    isStreaming: lastStep.data.state === "active",
  };
}

onMounted(() => {
  if (route.query.prompt) {
    chat.sendMessage({ text: route.query.prompt as string });
    const router = useRouter();
    router.replace({ query: {} });
  } else if (data.value?.messages.length === 1) {
    chat.regenerate();
  }
});
</script>

<template>
  <UDashboardPanel
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <div class="flex flex-1">
        <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
          <UChatMessages
            should-auto-scroll
            :messages="chat.messages"
            :status="chat.status"
            :assistant="
              chat.status !== 'streaming'
                ? {
                    actions: [
                      {
                        label: t('chat.copy'),
                        icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy',
                        onClick: copy,
                      },
                    ],
                  }
                : { actions: [] }
            "
            :spacing-offset="160"
            class="lg:pt-(--ui-header-height) pb-4 sm:pb-6"
          >
            <template #content="{ message }">
              <!-- Render all pipeline steps in a single collapsed block -->
              <AppReasoning
                v-if="getStepParts(message)"
                :text="getStepParts(message)!.text"
                :is-streaming="getStepParts(message)!.isStreaming"
              />

              <template
                v-for="(part, index) in message.parts"
                :key="`${message.id}-${part.type}-${index}${'state' in part ? `-${(part as any).state}` : ''}`"
              >
                <!-- Only render markdown for assistant messages to prevent XSS from user input -->
                <MDCCached
                  v-if="part.type === 'text' && message.role === 'assistant'"
                  :value="(part as any).text"
                  :cache-key="`${message.id}-${index}`"
                  :components="components"
                  :parser-options="{ highlight: false }"
                  class="*:first:mt-0 *:last:mb-0"
                />
                <!-- User messages are rendered as plain text (safely escaped by Vue) -->
                <p
                  v-else-if="part.type === 'text' && message.role === 'user'"
                  class="whitespace-pre-wrap"
                >
                  {{ (part as any).text }}
                </p>
              </template>

              <!-- Citations rendered after the main content -->
              <template
                v-for="(part, index) in message.parts"
                :key="`cit-${message.id}-${index}`"
              >
                <AppCitations
                  v-if="part.type === 'data-chunks'"
                  :chunks="(part as any).data"
                />
              </template>
            </template>
          </UChatMessages>

          <UChatPrompt
            v-model="input"
            :placeholder="t('chat.placeholder')"
            :error="chat.error"
            variant="subtle"
            class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
            :ui="{ base: 'px-1.5' }"
            @submit="handleSubmit"
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

              <UChatPromptSubmit
                :status="chat.status"
                color="neutral"
                size="sm"
                @stop="chat.stop()"
                @reload="chat.regenerate()"
              />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
