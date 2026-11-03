import { measure } from './perf.js';
for (const r of measure(10000)) console.log(String(r.ms).padStart(8), ' ', r.label);
