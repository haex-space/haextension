import { createApp } from 'vue'
import { setupApp } from '~/logic/common-setup'
import App from './Onboarding.vue'
import '../styles'

async function main() {
  const app = createApp(App)
  await setupApp(app)
  app.mount('#app')
}

main()
