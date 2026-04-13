import { PostHog } from 'posthog-node/edge';

const client = new PostHog(import.meta.env.VITE_POSTHOG_API_KEY, {
  host: import.meta.env.VITE_POSTHOG_HOST,
  enableExceptionAutocapture: true,
});

export default client;
