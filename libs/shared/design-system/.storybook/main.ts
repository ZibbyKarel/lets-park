import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 10 + Vite for the whole design system.
 *
 * There were two of these, one per layer, and the compounds copy said why: the
 * layers were separate Nx projects with separate lint, typecheck and
 * build-storybook targets, and a shared instance would have had to reach across
 * a project boundary. They are one project now, so one Storybook — and the
 * sidebar reads better for it, since a compound and the primitives it composes
 * are no longer in different browser tabs.
 *
 * The stories glob covers both layers. The tokens layer has no stories: it
 * exports strings, not components.
 *
 * The design system has no app to borrow a Vite config from, so the one thing
 * the stories need beyond the framework defaults is set up here, Tailwind v4
 * through its official Vite plugin. Tailwind v4 is CSS-first — there is no
 * `tailwind.config.js` for the plugin to read; the theme comes from
 * `preview.css`, which imports `assets/theme.css`.
 *
 * No addons: the accessibility bar for these components is enforced by the
 * Jest + Testing Library specs next to each one (roles, focus, keyboard), not
 * by a panel a human has to remember to look at.
 */
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  core: { disableTelemetry: true },
  viteFinal(viteConfig) {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];

    return viteConfig;
  },
};

export default config;
