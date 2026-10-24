import { Frame } from '@shopify/polaris';
import BillingGate from './components/BillingGate';
import BrandsPage from './pages/BrandsPage';

// Frame is required for Polaris Toast (and ContextualSaveBar, etc.) to render.
// BillingGate shows the app only when the store's plan allows it (public app
// only; see web/src/api/billing.js). When Phase 3 adds more pages, swap
// BrandsPage for a router and keep Frame and BillingGate at this level.
export default function App() {
  return (
    <Frame>
      <BillingGate>
        <BrandsPage />
      </BillingGate>
    </Frame>
  );
}
