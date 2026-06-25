import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

// Copies the compiled GOV.UK stylesheet into public/ so it's served as a static
// asset and loaded via a plain <link>. We can't `import` it through the bundler:
// govuk-frontend's minified CSS still ships a legacy `@media screen\0` IE hack
// that Turbopack's CSS parser rejects. Serving the file verbatim from public/
// sidesteps the CSS pipeline entirely. Run from predev/prebuild so the vendored
// copy always matches the installed package version.
const require = createRequire(import.meta.url);
const src = require.resolve("govuk-frontend/dist/govuk/govuk-frontend.min.css");
const dest = "public/vendor/govuk-frontend.min.css";

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);

console.log(`Copied GOV.UK CSS → ${dest}`);
