import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'

// The admin panel is a separate bundle on its own URL (/admin). School users never download it
// and nothing in the school app links to it.
const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin'

async function start() {
  const App = isAdminRoute
    ? (await import('./admin/AdminApp.jsx')).default
    : (await import('./App.jsx')).default
  if (!isAdminRoute) await import('./index.css')

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

start()
