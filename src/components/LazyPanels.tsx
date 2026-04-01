import { lazy, ReactNode, Suspense } from 'react';

/**
 * Code splitting & lazy loading configuration for DAEMON
 * Reduces initial bundle size by deferring non-critical panels
 *
 * SETUP:
 * As new panels are built, add them here with lazy() for code splitting.
 * Example:
 *   const LazyPluginDashboard = lazy(() => import('../panels/PluginDashboard'));
 *
 * Then in App.tsx, use LazyPanelWrapper to render with Suspense boundary
 */

/**
 * Loading fallback component
 */
// Inline hex required — renders before CSS loads
export const LoadingFallback = () => (
  <div
    style={{
      padding: '1rem',
      textAlign: 'center',
      color: '#7a7a7a',
    }}
  >
    Loading panel...
  </div>
);

/**
 * Lazy panel wrapper - handles loading and error states
 * Usage:
 *   <LazyPanelWrapper>
 *     <YourComponent />
 *   </LazyPanelWrapper>
 */
export const LazyPanelWrapper = ({
  children,
  fallback = <LoadingFallback />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) => <Suspense fallback={fallback}>{children}</Suspense>;

/**
 * Integration template for LazyPanels
 *
 * When new panels are added, update this file like:
 *
 * const LazyPluginDashboard = lazy(() => import('../panels/PluginDashboard'));
 * const LazyImageGen = lazy(() => import('../panels/ImageGen'));
 *
 * export const LazyPanels = {
 *   PluginDashboard: (
 *     <LazyPanelWrapper>
 *       <LazyPluginDashboard />
 *     </LazyPanelWrapper>
 *   ),
 *   ImageGen: (
 *     <LazyPanelWrapper>
 *       <LazyImageGen />
 *     </LazyPanelWrapper>
 *   ),
 * };
 *
 * Then in App.tsx, use in your panel switch:
 *   case 'plugins':
 *     return LazyPanels.PluginDashboard;
 *   case 'imagegen':
 *     return LazyPanels.ImageGen;
 *
 * Benefits:
 * - Components only bundled when used
 * - Lazy-loaded on first panel render
 * - Improves initial app startup time
 * - Reduces memory footprint
 */

export const LazyPanels = {
  // Add lazy components here as they are built
};
