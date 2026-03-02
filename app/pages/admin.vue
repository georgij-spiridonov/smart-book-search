<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'

const { t } = useI18n()

const schema = z.object({
  password: z.string().min(1, t('admin.password') + ' is required')
})

type Schema = z.output<typeof schema>

const state = reactive({
  password: ''
})

const loading = ref(false)
const error = ref<string | undefined>(undefined)
const success = ref(false)
const revoked = ref(false)

const { user, fetch: fetchSession } = useUserSession()

const isAdmin = computed(() => user.value?.isAdmin === true)

// Clear error when user starts typing
watch(() => state.password, () => {
  if (error.value) error.value = undefined
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  
  try {
    await $fetch('/api/admin/login', {
      method: 'POST',
      body: event.data
    })
    
    await fetchSession()
    
    success.value = true
    state.password = ''
    
    setTimeout(() => {
      navigateTo('/')
    }, 1500)
  } catch (err: unknown) {
    const fetchError = err as { data?: { statusMessage?: string } }
    error.value = fetchError.data?.statusMessage || t('admin.loginError')
  } finally {
    loading.value = false
  }
}

async function onLogout() {
  loading.value = true
  
  try {
    await $fetch('/api/admin/logout', { method: 'POST' })
    
    // Most reliable way to clear client state: full page reload
    window.location.reload()
  } catch {
    error.value = t('error.unexpected')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="admin-login" class="min-h-0">
    <template #body>
      <div class="flex-1 flex items-center justify-center p-4">
        <UCard class="w-full max-w-sm">
          <template #header>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <UIcon :name="isAdmin ? 'i-heroicons-shield-exclamation' : 'i-heroicons-shield-check'" class="w-5 h-5 text-primary" />
                <h1 class="text-xl font-bold">{{ t('admin.title') }}</h1>
              </div>
              <p class="text-sm text-neutral-500">
                {{ t('admin.description') }}
              </p>
            </div>
          </template>

          <div v-if="isAdmin" class="space-y-4">
            <div class="p-3 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 flex items-center gap-3">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-primary" />
              <p class="text-sm text-primary-700 dark:text-primary-300 font-medium">
                {{ t('admin.accessGranted') }}
              </p>
            </div>

            <UButton
              block
              :loading="loading"
              :color="revoked ? 'neutral' : 'error'"
              :variant="revoked ? 'soft' : 'solid'"
              :icon="revoked ? 'i-heroicons-arrow-left' : 'i-heroicons-lock-open'"
              @click="onLogout"
            >
              {{ revoked ? t('admin.accessRevoked') : t('admin.logout') }}
            </UButton>

            <p v-if="revoked" class="text-sm text-center text-neutral-500">
              {{ t('admin.redirectingHome') }}
            </p>
          </div>

          <UForm 
            v-else
            :schema="schema" 
            :state="state" 
            class="space-y-4" 
            @submit="onSubmit"
          >
            <UFormField :label="t('admin.password')" name="password" :error="error">
              <UInput
                v-model="state.password"
                type="password"
                placeholder="••••••••"
                icon="i-lucide-lock"
                color="neutral"
                variant="outline"
                autocomplete="current-password"
                class="w-full"
                :disabled="loading || success"
              />
            </UFormField>

            <UButton
              type="submit"
              block
              :loading="loading"
              :color="success ? 'success' : 'primary'"
              :icon="success ? 'i-heroicons-check' : undefined"
              :disabled="success"
            >
              {{ success ? t('admin.accessGranted') : t('admin.login') }}
            </UButton>

            <p v-if="success" class="text-sm text-center text-success">
              {{ t('admin.redirecting') }}
            </p>
          </UForm>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
