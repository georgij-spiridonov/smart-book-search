<script setup lang="ts">
import { Analytics } from "@vercel/analytics/nuxt";

const { t, locale } = useI18n();
const colorMode = useColorMode();

const color = computed(() =>
  colorMode.value === "dark" ? "#1b1718" : "white",
);

useHead({
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { key: "theme-color", name: "theme-color", content: color },
  ],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: {
    lang: locale,
  },
});

const title = computed(() => t("seo.pageTitle"));
const description = computed(() => t("seo.pageDescription"));

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
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
