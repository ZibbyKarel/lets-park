import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 10 + Vite for the compounds layer.
 *
 * Identical in shape to the primitives' config
 * (`libs/design-system/primitives/.storybook/main.ts`) and deliberately so:
 * the design system has no app to borrow a Vite config from, so the one thing
 * the stories need beyond the framework defaults is set up here, Tailwind v4
 * through its official Vite plugin. Tailwind v4 is CSS-first — there is no
 * `tailwind.config.js` for the plugin to read; the theme comes from
 * `preview.css`, which imports the tokens lib's `theme.css`.
 *
 * A second Storybook rather than more stories in the first one: the two libs
 * are separate Nx projects with separate lint, typecheck and build-storybook
 * targets, and a shared instance would have to reach across the project
 * boundary the `ds:*` tags exist to draw.
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
