/**
 * Regenerates `assets/tokens.css` from the TS token source.
 *
 * Run via `npx nx run design-system:generate-css`. The output is
 * committed (see `doc/design-system.md` for why), so run this and commit the
 * diff whenever a token value changes — `generate-css.spec.ts` fails CI if
 * you forget.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateTokensCss } from '../src/tokens/lib/generate-css';
import { DESIGN_TOKENS } from '../src/tokens/lib/tokens';

const outputPath = join(__dirname, '../assets/tokens.css');
const css = generateTokensCss(DESIGN_TOKENS);

writeFileSync(outputPath, css, 'utf-8');
console.log(`Wrote ${outputPath}`);
