import {
  captureClientRouterTransition,
  preloadClientObservability,
} from "@/lib/client-observability";

preloadClientObservability();

export const onRouterTransitionStart = captureClientRouterTransition;
