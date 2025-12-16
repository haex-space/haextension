import { createApp } from 'vue'
import App from './Popup.vue'
import { setupApp } from '~/logic/common-setup'
import '../styles'

async function main() {
  const app = createApp(App)
  await setupApp(app)
  app.mount('#app')
}

main()
