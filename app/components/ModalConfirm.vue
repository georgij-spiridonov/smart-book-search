<script setup lang="ts">
const { t } = useI18n();

defineProps<{
  title: string;
  description: string;
}>();

const emit = defineEmits<{ close: [boolean] }>();
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :ui="{
      footer: 'flex-row-reverse justify-start',
    }"
    :close="false"
    :dismissible="false"
  >
    <template #footer>
      <UButton :label="t('chat.deleteButton')" @click="emit('close', true)" />
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('chat.cancelButton')"
        @click="emit('close', false)"
      />
    </template>
  </UModal>
</template>
