<script setup lang="ts">
// TODO(i18n): strings in the template are hard-coded German. The options page
// already uses vue-i18n; the same setup needs to be wired into the content
// script's Vue app (load locale from storage on init). Tracked in /TODO.md.
import type { PasskeyConsentDecision, PasskeyConsentRequest } from '../passkey-consent'
import { onMounted, ref } from 'vue'
import { registerPasskeyConsentUi } from '../passkey-consent'

const active = ref<PasskeyConsentRequest | null>(null)
const remember = ref(false)
let resolveActive: ((value: PasskeyConsentDecision | null) => void) | null = null

onMounted(() => {
  registerPasskeyConsentUi((req) => {
    return new Promise((resolve) => {
      active.value = req
      remember.value = false
      resolveActive = resolve
    })
  })
})

function pick(choice: 'haex-pass' | 'browser') {
  if (!resolveActive)
    return
  const decision: PasskeyConsentDecision = { choice, remember: remember.value }
  resolveActive(decision)
  resolveActive = null
  active.value = null
}

function cancel() {
  if (!resolveActive)
    return
  resolveActive(null)
  resolveActive = null
  active.value = null
}
</script>

<template>
  <div
    v-if="active"
    class="hp-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="hp-passkey-title"
  >
    <div class="hp-card">
      <div class="hp-header">
        <div class="hp-icon">
          🔑
        </div>
        <div>
          <h2 id="hp-passkey-title" class="hp-title">
            Passkey-Anfrage
          </h2>
          <p class="hp-subtitle">
            <span class="hp-rp">{{ active.rpDisplayName }}</span>
            möchte
            <span v-if="active.kind === 'create'">einen Passkey registrieren</span>
            <span v-else>sich mit einem Passkey anmelden</span>.
          </p>
        </div>
      </div>

      <p class="hp-body">
        Wer soll diese Anfrage bearbeiten?
      </p>

      <div class="hp-actions">
        <button class="hp-btn hp-btn-primary" @click="pick('haex-pass')">
          <span class="hp-btn-title">haex-vault</span>
          <span class="hp-btn-hint">Passkey in deinem Vault speichern</span>
        </button>
        <button class="hp-btn hp-btn-secondary" @click="pick('browser')">
          <span class="hp-btn-title">Browser / Hardware-Key</span>
          <span class="hp-btn-hint">Native WebAuthn (z. B. Yubikey, Touch-ID)</span>
        </button>
      </div>

      <label class="hp-remember">
        <input v-model="remember" type="checkbox">
        Entscheidung für <code>{{ active.rpId }}</code> merken
      </label>

      <button class="hp-cancel" @click="cancel">
        Abbrechen
      </button>
    </div>
  </div>
</template>

<style scoped>
.hp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483647;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  color: #111;
}

.hp-card {
  background: #fff;
  border-radius: 12px;
  width: min(420px, calc(100vw - 32px));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  padding: 20px 22px;
}

.hp-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.hp-icon {
  font-size: 28px;
  line-height: 1;
}

.hp-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.hp-subtitle {
  margin: 4px 0 0;
  color: #555;
  line-height: 1.4;
}

.hp-rp {
  font-weight: 600;
  color: #111;
}

.hp-body {
  margin: 8px 0 14px;
  color: #333;
}

.hp-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.hp-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  background: #f7f7f7;
  transition: border-color 0.15s, background 0.15s;
}

.hp-btn:hover {
  background: #efefef;
}

.hp-btn-primary {
  background: #0e7a52;
  color: #fff;
}

.hp-btn-primary:hover {
  background: #0b6444;
}

.hp-btn-title {
  font-weight: 600;
  margin-bottom: 2px;
}

.hp-btn-hint {
  font-size: 12px;
  opacity: 0.85;
}

.hp-remember {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  color: #444;
}

.hp-remember code {
  background: #f0f0f0;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}

.hp-cancel {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 8px;
  background: transparent;
  border: 0;
  color: #777;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}

.hp-cancel:hover {
  color: #333;
}
</style>
