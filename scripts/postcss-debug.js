// scripts/postcss-debug.js
const postcss = require('postcss');
const cfg = require('../postcss.config.js'); // adjust path if needed
const fs = require('fs');
console.log('Loaded postcss config:', Object.keys(cfg.plugins || {}));
for (const pluginName of Object.keys(cfg.plugins || {})) {
  try {
    const mod = require(pluginName);
    console.log(pluginName, '->', typeof mod);
  } catch (e) {
    console.log('Unable to require plugin', pluginName, e.message);
  }
}
const cssFile = './client/src/index.css'; // adjust if your entrypoint differs
const css = fs.readFileSync(cssFile, 'utf8');
postcss(Object.keys(cfg.plugins || {}).map(p => require(p)(cfg.plugins[p])))
  .process(css, { from: cssFile })
  .then(result => {
    console.log('PostCSS processed OK, warnings:', result.warnings().length);
    result.warnings().forEach(w => console.log(w.toString()));
  })
  .catch(err => {
    console.error('Error running postcss:', err.stack || err);
  });
