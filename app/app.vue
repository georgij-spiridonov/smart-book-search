<script setup lang="ts">
import { Analytics } from "@vercel/analytics/nuxt";
</script>

<template>
  <UApp>
    <div class="hidden">{{ $t("app.title") }}</div>
    <NuxtPage />
    <Analytics />
  </UApp>
</template>
