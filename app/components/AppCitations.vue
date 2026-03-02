<script setup lang="ts">
/**
 * Компонент для отображения списка цитат, послуживших основой для ответа.
 * Отображает цитаты в виде раскрывающегося списка с возможностью просмотра каждой цитаты отдельно.
 */
import { LazyModalCitationView } from "#components";

/** Фрагмент текста из книги, используемый как цитата. */
interface CitationChunk {
  /** Уникальный индекс фрагмента. */
  index: number;
  /** Текст цитаты. */
  text: string;
  /** Номер страницы, на которой находится текст. */
  pageNumber: number;
  /** Заголовок главы (при наличии). */
  chapterTitle?: string;
  /** Оценка релевантности фрагмента запросу. */
  score: number;
  /** Идентификатор книги, из которой взят фрагмент. */
  bookId: string;
}

// Определение входных параметров компонента
defineProps<{
  /** Список фрагментов текста (цитат) */
  chunks: CitationChunk[];
}>();

const { t } = useI18n();
const overlay = useOverlay();
const isExpanded = ref(false);

/**
 * Открывает модальное окно для детального просмотра цитаты.
 * @param chunk Объект цитаты, которую нужно отобразить.
 */
function openCitationDetails(chunk: CitationChunk): void {
  const modal = overlay.create(LazyModalCitationView, {
    props: {
      text: chunk.text,
      chapterTitle: chunk.chapterTitle,
      pageNumber: chunk.pageNumber,
      onClose: () => modal.close(),
    },
  });
  modal.open();
}
</script>

<template>
  <div v-if="chunks?.length" class="flex flex-col gap-3 mt-4 border-t border-default/50 pt-4">
    <UCollapsible v-model:open="isExpanded" class="flex flex-col gap-3">
      <UButton
        color="neutral"
        variant="ghost"
        class="p-1 -ml-1 group w-fit justify-start"
        :ui="{
          trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
        }"
        trailing-icon="i-lucide-chevron-down"
        :label="t('chat.citationsLabel')"
      >
        <template #leading>
          <UIcon name="i-lucide-quote" class="size-3.5 text-muted" />
        </template>
      </UButton>

      <template #content>
        <div class="flex flex-col gap-3">
          <div
            v-for="(chunk, index) in chunks"
            :key="index"
            class="p-3 rounded-lg ring ring-default bg-elevated/25 transition-colors hover:bg-elevated/50 cursor-pointer"
            @click="openCitationDetails(chunk)"
          >
            <div class="text-sm font-semibold text-highlighted line-clamp-1">
              {{ chunk.chapterTitle || t('chat.untitledChapter') }}
            </div>
            <div class="mt-1 text-xs text-muted line-clamp-2 leading-relaxed">
              {{ chunk.text }}
            </div>
          </div>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
