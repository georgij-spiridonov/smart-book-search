<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'

const { t } = useI18n()

// Схема валидации для формы входа
const administratorLoginSchema = z.object({
  password: z.string().min(1, t('admin.passwordField') + ' обязателен')
})

type AdministratorLoginFields = z.output<typeof administratorLoginSchema>

const loginState = reactive({
  password: ''
})

const isSubmitting = ref(false)
const submissionError = ref<string | undefined>(undefined)
const isLoginSuccessful = ref(false)

const { user: currentUser, fetch: refreshUserSession } = useUserSession()

const isUserAdministrator = computed(() => currentUser.value?.isAdmin === true)

// Очищаем ошибку, когда пользователь начинает вводить пароль
watch(() => loginState.password, () => {
  if (submissionError.value) submissionError.value = undefined
})

/**
 * Обрабатывает отправку формы входа администратора.
 */
async function handleLoginSubmit(event: FormSubmitEvent<AdministratorLoginFields>) {
  isSubmitting.value = true
  submissionError.value = ''
  
  try {
    await $fetch('/api/admin/login', {
      method: 'POST',
      body: event.data
    })
    
    await refreshUserSession()
    
    isLoginSuccessful.value = true
    loginState.password = ''
    
    // Перенаправляем на главную после успешного входа
    setTimeout(() => {
      navigateTo('/')
    }, 1500)
  } catch (error: unknown) {
    const fetchError = error as { data?: { message?: string; statusMessage?: string } }
    submissionError.value = fetchError.data?.message || fetchError.data?.statusMessage || t('admin.loginErrorMessage')
  } finally {
    isSubmitting.value = false
  }
}

/**
 * Обрабатывает выход из системы.
 */
async function handleLogout() {
  isSubmitting.value = true
  
  try {
    await $fetch('/api/admin/logout', { method: 'POST' })
    
    // Самый надежный способ очистить состояние клиента — полная перезагрузка страницы
    if (import.meta.client) {
      window.location.reload()
    }
  } catch {
    submissionError.value = t('error.unexpectedError')
  } finally {
    isSubmitting.value = false
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
                <UIcon :name="isUserAdministrator ? 'i-heroicons-shield-exclamation' : 'i-heroicons-shield-check'" class="w-5 h-5 text-primary" />
                <h1 class="text-xl font-bold">{{ t('admin.mainTitle') }}</h1>
              </div>
              <p class="text-sm text-neutral-500">
                {{ t('admin.mainDescription') }}
              </p>
            </div>
          </template>

          <div v-if="isUserAdministrator" class="space-y-4">
            <div class="p-3 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 flex items-center gap-3">
              <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-primary" />
              <p class="text-sm text-primary-700 dark:text-primary-300 font-medium">
                {{ t('admin.accessGrantedMessage') }}
              </p>
            </div>

            <UButton
              block
              :loading="isSubmitting"
              color="error"
              variant="solid"
              icon="i-heroicons-lock-open"
              @click="handleLogout"
            >
              {{ t('admin.logoutButton') }}
            </UButton>
          </div>

          <UForm 
            v-else
            :schema="administratorLoginSchema" 
            :state="loginState" 
            class="space-y-4" 
            @submit="handleLoginSubmit"
          >
            <UFormField :label="t('admin.passwordField')" name="password" :error="submissionError">
              <UInput
                v-model="loginState.password"
                type="password"
                placeholder="••••••••"
                icon="i-lucide-lock"
                color="neutral"
                variant="outline"
                autocomplete="current-password"
                class="w-full"
                :disabled="isSubmitting || isLoginSuccessful"
              />
            </UFormField>

            <UButton
              type="submit"
              block
              :loading="isSubmitting"
              :color="isLoginSuccessful ? 'success' : 'primary'"
              :icon="isLoginSuccessful ? 'i-heroicons-check' : undefined"
              :disabled="isLoginSuccessful"
            >
              {{ isLoginSuccessful ? t('admin.accessGrantedMessage') : t('admin.loginButton') }}
            </UButton>

            <p v-if="isLoginSuccessful" class="text-sm text-center text-success">
              {{ t('admin.redirectingMessage') }}
            </p>
          </UForm>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
