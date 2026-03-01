<script setup lang="ts">
import * as locales from "@nuxt/ui/locale";

const { locale: i18nLocale, locales: i18nLocales, setLocale, t } = useI18n();
const { user } = useUserSession();

const isAdmin = computed(() => user.value?.isAdmin === true);

const currentLocale = computed({
  get: () => i18nLocale.value,
  set: (val) => {
    setLocale(val);
  },
});

const availableLocales = computed(() => {
  return i18nLocales.value.map((l) => locales[l.code as keyof typeof locales]);
});
</script>

<template>
  <UDashboardNavbar
    class="sticky lg:absolute top-0 inset-x-0 border-b-0 z-10 bg-default/75 backdrop-blur lg:bg-transparent lg:backdrop-blur-none pointer-events-none px-4 sm:px-6 lg:px-8"
    :ui="{ left: 'pointer-events-auto', right: 'pointer-events-auto' }"
  >
    <template #left>
      <UDashboardSidebarCollapse />
      <slot name="left-aligned" />
    </template>

    <template #right>
      <slot name="right-aligned" />

      <UButton
        v-if="isAdmin"
        variant="subtle"
        color="primary"
        size="sm"
        class="pointer-events-auto mr-2 hidden sm:flex"
        icon="i-heroicons-shield-check"
        to="/admin"
      >
        {{ t('admin.title') }}
      </UButton>

      <ULocaleSelect v-model="currentLocale" :locales="availableLocales" />
      <UColorModeButton />

      <UButton
        color="primary"
        variant="subtle"
        icon="i-lucide-square-pen"
        to="/"
        class="lg:hidden"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-library"
        to="/library"
        class="lg:hidden"
      />
    </template>
  </UDashboardNavbar>
</template>
