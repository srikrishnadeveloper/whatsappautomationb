import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { startBrowserLogger } from './services/browserLogger'

// Mirror every backend console.log into browser DevTools → Console
startBrowserLogger()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
