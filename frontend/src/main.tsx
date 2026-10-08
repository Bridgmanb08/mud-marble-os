import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Scrolling the page while the cursor sits in a focused number box would otherwise nudge its value
// (a line item's profit, a quantity, a rate...). Drop focus on wheel so the page scrolls and the
// number stays exactly as typed.
document.addEventListener(
  'wheel',
  (e) => {
    const el = document.activeElement
    if (el instanceof HTMLInputElement && el.type === 'number' && e.target === el) el.blur()
  },
  { passive: true },
)

// Same for the up/down arrow keys, which step a number field. Left/right still move the caret.
document.addEventListener('keydown', (e) => {
  const el = e.target
  if (el instanceof HTMLInputElement && el.type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
