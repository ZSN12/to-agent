import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installNativeShellBridge } from './shell/bootstrap'
import App from './App'

installNativeShellBridge()
import './styles.css'
import './styles-dsh-parity.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
