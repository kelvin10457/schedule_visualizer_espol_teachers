import { HashRouter } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import './main.css'
import App from './App.tsx'

// HashRouter (en vez de BrowserRouter) porque esta app se sirve como archivos estáticos
// sin servidor: tanto dentro de la extensión (chrome-extension://.../app/index.html#/...)
// como en cualquier hosting estático, no hay quien reescriba rutas al recargar la página.
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
)
