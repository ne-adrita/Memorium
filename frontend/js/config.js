/* Memorium — Frontend Runtime Config
   Replace __MEMORIUM_API_URL at deploy time.
   For static hosts (Netlify/Vercel), set window.__MEMORIUM_API_URL via:
     - Editing this file before deploy, OR
     - Injecting a <script> tag before config.js that sets window.__MEMORIUM_API_URL
   Local dev defaults to http://localhost:3000
   Production must be set to your deployed backend URL, e.g. https://memorium-api.onrender.com
   Note: Auth uses httpOnly refresh cookie (7d) + short-lived access token (15m).
   All API fetches include credentials:"include" so the refresh cookie is sent to /api/auth/refresh.
*/
(function () {
  // If already injected (e.g., by deployment platform snippet), keep it
  if (typeof window.__MEMORIUM_API_URL === 'string' && window.__MEMORIUM_API_URL.trim()) {
    window.__MEMORIUM_API_URL = window.__MEMORIUM_API_URL.trim().replace(/\/$/, '');
    return;
  }
  // Default: try to use same origin if frontend is served by backend (SERVE_FRONTEND=true)
  // If frontend and backend are separate, you MUST set this to your backend URL.
  const isLocalHost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalHost) {
    window.__MEMORIUM_API_URL = 'http://localhost:3000';
  } else {
    // In production with separate hosting, override this value.
    // Example: window.__MEMORIUM_API_URL = 'https://your-backend.onrender.com';
    window.__MEMORIUM_API_URL = '';
    // If empty and frontend is served by backend, API is same origin
    if (!window.__MEMORIUM_API_URL) {
      window.__MEMORIUM_API_URL = window.location.origin;
    }
  }
  window.__MEMORIUM_API_URL = window.__MEMORIUM_API_URL.replace(/\/$/, '');
})();
