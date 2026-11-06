#!/usr/bin/env node
/**
 * export-defaults.mjs - Write ParaFin's default model to disk without a browser.
 *
 * The browser modules (geometry.js, project-io.js, exporter.js) are classic
 * scripts that define globals, so they are evaluated in a sandboxed vm context
 * instead of being imported. Output is deterministic for a given source tree.
 *
 * Usage: node scripts/export-defaults.mjs [outDir]
 *   outDir  Output directory (default: dist)
 *
 * Writes:
 *   parafin-model.geo   Gmsh geometry for the default parameters
 *   parafin-model.json  Project JSON for the default parameters
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'dist'));

// Order matters: exporter.js references _ProjectIO at load time.
const sources = ['geometry.js', 'project-io.js', 'exporter.js']
    .map((name) => readFileSync(join(root, 'js', name), 'utf8').replace(/^﻿/, ''))
    .join('\n;\n');

const { Geometry, Exporter } = vm.runInNewContext(
    `${sources}\n;({ Geometry, Exporter })`,
    {},
    { filename: 'parafin-browser-modules.js' }
);

const params = Geometry.getDefaultParameters();

const validation = Geometry.validateParameters(params);
if (!validation.valid) {
    throw new Error('Default parameters are invalid: ' + JSON.stringify(validation));
}
const meshValidation = Geometry.validateMeshSettings(params.mesh);
if (!meshValidation.valid) {
    throw new Error('Default mesh settings are invalid: ' + JSON.stringify(meshValidation));
}

const geometry = Geometry.generateGeometry(params);
const geo = Exporter.generateGEO(params, geometry);
const json = JSON.stringify(Exporter.generateJSON(params), null, 2) + '\n';

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'parafin-model.geo'), geo.endsWith('\n') ? geo : geo + '\n');
writeFileSync(join(outDir, 'parafin-model.json'), json);

console.log(`Wrote parafin-model.geo and parafin-model.json to ${outDir}`);
