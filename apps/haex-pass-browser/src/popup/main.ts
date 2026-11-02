import { createApp } from 'vue'
import { setupApp } from '~/logic/common-setup'
import { initPassgen } from '~/logic/passwordGenerator'
import App from './Popup.vue'
import '../styles'

async function main() {
  // The password generator (WebAssembly) is ready before anything can ask for a password.
  await initPassgen()
  const app = createApp(App)
  await setupApp(app)
  app.mount('#app')
}

main()
