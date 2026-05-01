import { Frame } from '@shopify/polaris';
import BrandsPage from './pages/BrandsPage';

// Frame is required for Polaris Toast (and ContextualSaveBar, etc.) to render.
// When Phase 3 adds more pages, swap BrandsPage for a router and keep the
// Frame at this level.
export default function App() {
  return (
    <Frame>
      <BrandsPage />
    </Frame>
  );
}
