import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.tsx'
import Callback from './components/Callback.tsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
const audience = import.meta.env.VITE_AUTH0_AUDIENCE

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: window.location.origin + '/callback',
          audience: audience,
          scope: 'openid profile email read:vehicles write:vehicles read:events write:events chat:ai',
        }}
        useRefreshTokens={true}
        cacheLocation="localstorage"
      >
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/callback" element={<Callback />} />
        </Routes>
      </Auth0Provider>
    </BrowserRouter>
  </StrictMode>,
)
