<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NCard, NForm, NFormItem, NInput, NTabPane, NTabs, useMessage } from 'naive-ui'
import { api, errorMessage } from '../lib/api'
import { store } from '../lib/store'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const tab = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const password2 = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!username.value.trim() || !password.value) { error.value = '请输入用户名和密码'; return }
  if (tab.value === 'register' && password.value !== password2.value) { error.value = '两次输入的密码不一致'; return }
  busy.value = true
  try {
    const r = tab.value === 'login' ? await api.login(username.value.trim(), password.value) : await api.register(username.value.trim(), password.value)
    store.user = r.user
    message.success(tab.value === 'login' ? '登录成功' : '注册成功')
    const redirect = String(route.query.redirect || '')
    if (r.user.is_admin && redirect.startsWith('/admin')) location.href = redirect
    else router.replace(redirect && redirect.startsWith('/') && !redirect.startsWith('/login') ? redirect : '/drive')
  } catch (e) { error.value = errorMessage(e) } finally { busy.value = false }
}
</script>

<template>
  <div class="container page">
    <NCard class="box" :bordered="false">
      <NTabs v-model:value="tab" type="line" justify-content="space-evenly" animated>
        <NTabPane name="login" tab="登录" />
        <NTabPane v-if="store.config?.allow_register" name="register" tab="注册" />
      </NTabs>
      <NForm style="margin-top: 16px" @submit.prevent="submit">
        <NFormItem label="用户名"><NInput v-model:value="username" placeholder="用户名" :input-props="{ autocomplete: 'username' }" /></NFormItem>
        <NFormItem label="密码"><NInput v-model:value="password" type="password" show-password-on="click" placeholder="密码" :input-props="{ autocomplete: tab === 'login' ? 'current-password' : 'new-password' }" /></NFormItem>
        <NFormItem v-if="tab === 'register'" label="确认密码"><NInput v-model:value="password2" type="password" placeholder="再次输入密码" /></NFormItem>
        <NAlert v-if="error" type="error" style="margin-bottom: 14px">{{ error }}</NAlert>
        <NButton type="primary" block attr-type="submit" :loading="busy" size="large">{{ tab === 'login' ? '登录' : '注册并登录' }}</NButton>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.box { max-width: 400px; margin: 32px auto; border-radius: 14px; box-shadow: 0 12px 32px rgba(28, 39, 64, .08); }
</style>
