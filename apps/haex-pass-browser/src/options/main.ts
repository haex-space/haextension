import { createApp } from 'vue'
import App from './Options.vue'
import { setupApp } from '~/logic/common-setup'
import '../styles'

async function main() {
  const app = createApp(App)
  await setupApp(app)
  app.mount('#app')
}

main()
