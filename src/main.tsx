import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/app'
import { WorkspaceProvider } from './app/workspace'
import { createLocalRepository } from './data/local-repository'
import './styles.css'

// Delay storage access until inside the repository so restricted browsers show the error UI.
const repository = createLocalRepository({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WorkspaceProvider repository={repository}>
        <App />
      </WorkspaceProvider>
    </BrowserRouter>
  </StrictMode>,
)
