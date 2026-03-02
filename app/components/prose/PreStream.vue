<script setup lang="ts">
/**
 * Компонент для отображения блоков кода с подсветкой синтаксиса в режиме реального времени.
 * Использует Shiki для качественной подсветки.
 */
import { ShikiCachedRenderer } from "shiki-stream/vue";

const colorMode = useColorMode();
const shikiHighlighter = await useHighlighter();

const props = defineProps<{
  /** Исходный код */
  code: string;
  /** Язык программирования */
  language: string;
  /** Дополнительные CSS-классы */
  class?: string;
  /** Метаданные блока кода */
  meta?: string;
}>();

/** Код с удаленными лишними пробелами и символами разметки в конце */
const normalizedCode = computed(() => {
  return props.code.trim().replace(/`+$/, "");
});

/** Сопоставление расширенных названий языков с их короткими идентификаторами */
const normalizedLanguage = computed(() => {
  switch (props.language) {
    case "vue":
      return "vue";
    case "javascript":
      return "js";
    case "typescript":
      return "ts";
    case "css":
      return "css";
    default:
      return props.language;
  }
});

/** Уникальный ключ для ререндеринга при смене темы или языка */
const rendererKey = computed(() => {
  return `${normalizedLanguage.value}-${colorMode.value}`;
});
</script>

<template>
  <ProsePre v-bind="props">
    <ShikiCachedRenderer
      :key="rendererKey"
      :highlighter="shikiHighlighter"
      :code="normalizedCode"
      :lang="normalizedLanguage"
      :theme="
        colorMode.value === 'dark'
          ? 'material-theme-palenight'
          : 'material-theme-lighter'
      "
    />
  </ProsePre>
</template>
