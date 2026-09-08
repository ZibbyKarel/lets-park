import type { Preview } from '@storybook/react-vite';

import './preview.css';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    backgrounds: {
      options: {
        page: { name: 'Page', value: 'var(--bg-soft)' },
        surface: { name: 'Surface', value: 'var(--bg)' },
        inverse: { name: 'Inverse', value: 'var(--bg-inverse)' },
      },
    },
  },
  initialGlobals: {
    backgrounds: { value: 'page' },
  },
};

export default preview;
