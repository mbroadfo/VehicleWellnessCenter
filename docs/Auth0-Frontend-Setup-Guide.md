# Auth0 Frontend User Authentication Setup Guide

## Overview

This guide walks through setting up proper user authentication for the Vehicle Wellness Center frontend using Auth0 Universal Login. This is **user authentication** (not M2M), where real users log in and get their own JWT tokens.

## Architecture

```text
User Browser
  ↓ (clicks Login)
Auth0 Universal Login Page
  ↓ (user enters credentials)
Auth0 validates & issues JWT
  ↓ (token returned to app)
React App (stores token)
  ↓ (API calls with Bearer token)
API Gateway JWT Authorizer
  ↓ (validates token with Auth0 public key)
Lambda Function (authorized request)
```

## What You Need to Create in Auth0

### 1. Create a Single Page Application (SPA)

In your Auth0 tenant dashboard:

1. Go to **Applications** → **Create Application**
2. Name: `Vehicle Wellness Center - Frontend`
3. Type: **Single Page Web Applications**
4. Click **Create**

After creation, configure:

#### Settings Tab

- **Application URIs:**
  - Allowed Callback URLs: `http://localhost:5173/callback, https://your-cloudfront-domain.com/callback`
  - Allowed Logout URLs: `http://localhost:5173, https://your-cloudfront-domain.com`
  - Allowed Web Origins: `http://localhost:5173, https://your-cloudfront-domain.com`
  - Allowed Origins (CORS): `http://localhost:5173, https://your-cloudfront-domain.com`

- **Advanced Settings** → **Grant Types:**
  - ✅ Authorization Code
  - ✅ Refresh Token
  - ✅ Implicit (for development only, disable in production)

Click **Save Changes** at the bottom of the page.

### 2. Note These Values

You'll need these for configuration:

- **Domain**: `your-tenant.auth0.com`
- **Client ID**: `abc123...` (from Application settings)
- **Audience**: Your existing API identifier (same one used for M2M)

The **audience** should match what's already in your Terraform `auth0_audience` variable - this is your API identifier in Auth0.

### 3. Verify API Configuration

Go to **Applications** → **APIs** → Your API:

- Ensure **RS256** signing algorithm (should already be set)
- Verify **Identifier/Audience** value matches Terraform config
- Under **Permissions** tab, add any scopes you need:
  - `read:vehicles`
  - `write:vehicles`
  - `read:events`
  - `write:events`
  - `chat:ai`

### 4. Create Test User (if needed)

Go to **User Management** → **Users** → **Create User**:

- Email: `your-email@example.com`
- Password: (set a password)
- Connection: Username-Password-Authentication

## Implementation Steps

### Step 1: Update Terraform with SPA Client ID

Add to `infra/terraform.tfvars`:

```hcl

# Auth0 Configuration
auth0_domain   = "your-tenant.auth0.com"
auth0_audience = "https://api.vehicle-wellness-center.com"  # Your existing API identifier

# Frontend SPA Client ID (new)
auth0_frontend_client_id = "abc123..."  # From SPA application
```

Add variable to `infra/main.tf`:

```hcl
variable "auth0_frontend_client_id" {
  description = "Auth0 SPA Client ID for frontend user authentication"
  type        = string
  sensitive   = true
}
```

Store in Parameter Store:

```hcl
resource "aws_ssm_parameter" "auth0_frontend_config" {
  name        = "/vwc/${var.environment}/auth0-frontend"
  description = "Auth0 frontend configuration (public values)"
  type        = "String"
  value = jsonencode({
    domain   = var.auth0_domain
    clientId = var.auth0_frontend_client_id
    audience = var.auth0_audience
  })
  tier = "Standard"

  tags = {
    Project     = "Vehicle Wellness Center"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
```

### Step 2: Configure Frontend Environment Variables

Create `frontend/.env.local`:

```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=abc123...
VITE_AUTH0_AUDIENCE=https://api.vehicle-wellness-center.com
VITE_API_BASE_URL=https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com
```

Add to `.gitignore`:

```gitignore
.env.local
```

Keep `.env.example` for documentation:

```env

# Auth0 Configuration
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=https://api.vehicle-wellness-center.com

# API Configuration
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.us-west-2.amazonaws.com
```

### Step 3: Implement Auth0Provider in React

Update `frontend/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import App from './App.tsx';
import './index.css';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
```

### Step 4: Update App.tsx with Auth0 Hooks

Replace mock token logic with real Auth0:

```tsx
import { useAuth0 } from '@auth0/auth0-react';

function App() {
  const { isLoading, isAuthenticated, error, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();

  // Get Auth0 token and set in API client
  useEffect(() => {
    const setToken = async () => {
      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently();
          apiClient.setToken(token);
        } catch (err) {
          console.error('Failed to get access token:', err);
        }
      }
    };
    setToken();
  }, [isAuthenticated, getAccessTokenSilently]);

  // Show login screen if not authenticated
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>;
  }

  if (error) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-red-600">
        <p>Authentication Error: {error.message}</p>
      </div>
    </div>;
  }

  if (!isAuthenticated) {
    return <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-primary-50 to-primary-100">
      <div className="card max-w-md text-center">
        <h1 className="text-3xl font-bold text-primary-900 mb-4">Vehicle Wellness Center</h1>
        <p className="text-gray-600 mb-6">Track maintenance, safety recalls, and more for your vehicles</p>
        <button 
          onClick={() => loginWithRedirect()}
          className="btn-primary w-full"
        >
          Log In
        </button>
      </div>
    </div>;
  }

  // ... rest of authenticated app logic
}
```

### Step 5: Add Logout Button to UI

Add a header component with user info and logout:

```tsx
function AppHeader({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth0();
  
  return (
    <header className="bg-primary-700 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">Vehicle Wellness Center</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm">{user?.email}</span>
          <button onClick={onLogout} className="btn-secondary text-sm">
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}
```

### Step 6: Handle Callback Route

Create `frontend/src/components/Callback.tsx`:

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Auth0 will handle the callback, then redirect
    navigate('/');
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing login...</p>
      </div>
    </div>
  );
}
```

## Security Benefits

1. **Real User Identity**: Token includes `sub` (user ID), email, and other claims
2. **Token Refresh**: Automatically refreshes tokens without re-login
3. **Secure Storage**: Tokens stored in localStorage with refresh token rotation
4. **API Gateway Validation**: Gateway validates signature using Auth0's public key
5. **No Secrets in Frontend**: Client ID is public, no secrets exposed
6. **Proper Scopes**: Fine-grained permissions per API endpoint

## Token Flow

1. User clicks "Log In"
2. Redirected to Auth0 Universal Login (`https://your-tenant.auth0.com/authorize?...`)
3. User enters credentials
4. Auth0 validates and issues JWT + refresh token
5. Redirected to `/callback` with authorization code
6. Auth0 SDK exchanges code for tokens
7. Access token stored in localStorage
8. Every API call includes `Authorization: Bearer <token>`
9. API Gateway validates token signature and audience
10. Lambda receives request with validated user context

## Testing

1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:5173`
3. Click "Log In" button
4. Enter Auth0 credentials
5. Redirected back to app
6. Enter VIN and test functionality
7. Token automatically included in all API calls

## Production Considerations

1. **Disable Implicit Grant** in Auth0 Application settings
2. **Use Authorization Code Flow** only (most secure for SPAs)
3. **Restrict Allowed Callback URLs** to production domain only
4. **Enable MFA** for users in Auth0 tenant
5. **Set Token Expiration** appropriately (15 min access, 7 day refresh)
6. **Monitor Auth0 Logs** for suspicious login attempts

## Next Steps

After implementation:

1. Test login/logout flow
2. Verify token in API calls (check Network tab)
3. Test token refresh (wait for expiration)
4. Add user profile page
5. Implement user-specific vehicle ownership (filter by `user.sub`)
