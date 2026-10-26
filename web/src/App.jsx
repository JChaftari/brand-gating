import { useEffect } from 'react';
import { Frame } from '@shopify/polaris';
import BillingGate from './components/BillingGate';
import BrandsPage from './pages/BrandsPage';
import { verifySession } from './api/session';

// Frame is required for Polaris Toast (and ContextualSaveBar, etc.) to render.
// BillingGate shows the app only when the store's plan allows it (public app
// only; see web/src/api/billing.js). When Phase 3 adds more pages, swap
// BrandsPage for a router and keep Frame and BillingGate at this level.
export default function App() {
  // Session token check on load (see web/src/api/session.js); reported only.
  useEffect(() => {
    verifySession()
      .then((r) => {
        if (!r.ok) console.warn('Session token was not accepted by /api/session');
      })
      .catch((err) => console.warn('Session check failed:', err));
  }, []);

  return (
    <Frame>
      <BillingGate>
        <BrandsPage />
      </BillingGate>
    </Frame>
  );
}
