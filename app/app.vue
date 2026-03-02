<script setup lang="ts">
import { Analytics } from "@vercel/analytics/nuxt";

/**
 * Основной компонент приложения, отвечающий за инициализацию метаданных,
 * глобальных стилей и структуры макета.
 */

// Использование i18n для локализации и SEO
const { t: translate, locale: currentLocale } = useI18n();
const globalColorMode = useColorMode();

// Константы цветов для темы
const DARK_THEME_COLOR = "#1b1718";
const LIGHT_THEME_COLOR = "white";

// Динамическое определение цвета темы в зависимости от режима
const themeColor = computed<string>(() =>
  globalColorMode.value === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR,
);

// Настройка заголовков HTML и мета-тегов
useHead({
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { key: "theme-color", name: "theme-color", content: themeColor },
  ],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: {
    lang: currentLocale,
  },
});

// Настройка SEO метаданных
const seoTitle = computed<string>(() => translate("seo.pageTitle"));
const seoDescription = computed<string>(() => translate("seo.pageDescription"));

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
});
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }" :tooltip="{ delayDuration: 200 }">
    <NuxtLoadingIndicator color="var(--ui-primary)" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <Analytics />
  </UApp>
</template>
