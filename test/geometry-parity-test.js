/**
 * Parity test: the browser (classic script) and npm (ES module) builds of the
 * geometry code must behave identically.
 *
 *   js/geometry.js + js/parafin-api.js          (used by index.html)
 *   js/geometry-core.js + js/parafin-api.esm.js (used via `npm install`)
 *
 * The two files are maintained as copies, so a fix applied to only one of
 * them would silently make the browser UI and the npm package disagree.
 * This test runs both over a set of parameter sets (valid and invalid) and
 * fails on the first difference.
 *
 * Run with: npm test
 */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as core from '../js/geometry-core.js';
import * as esmApi from '../js/parafin-api.esm.js';

const jsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Load the classic scripts the way a browser would: plain scripts sharing one global scope.
const context = vm.createContext({ console });
function runScript(file, exposeName) {
    const code = fs.readFileSync(path.join(jsDir, file), 'utf8');
    return vm.runInContext(code + '\n;' + exposeName + ';', context, { filename: file });
}
const Geometry = runScript('geometry.js', 'Geometry');
const ParaFin = runScript('parafin-api.js', 'ParaFin');

// Cross-realm objects are compared through JSON text (NaN/Infinity become null on both sides).
const json = (value) => JSON.stringify(value);

let failures = 0;
function same(label, browserValue, esmValue) {
    if (json(browserValue) !== json(esmValue)) {
        failures++;
        console.error('MISMATCH: ' + label);
        const a = json(browserValue), b = json(esmValue);
        let i = 0;
        while (i < a.length && a[i] === b[i]) i++;
        console.error('  first difference at character ' + i + ':');
        console.error('  browser: ...' + a.slice(Math.max(0, i - 40), i + 80));
        console.error('  esm    : ...' + b.slice(Math.max(0, i - 40), i + 80));
    }
}

const defaults = core.getDefaultParameters();
const withDefaults = (overrides, mesh) => ({
    ...defaults,
    ...overrides,
    mesh: { ...defaults.mesh, ...(mesh || {}) }
});

// Parameter sets that produce valid geometry, covering the main branches
// (ridges / papillae on or off, extreme sizes and angles, ...).
const validCases = {
    'defaults': {},
    'small finger': { fingerWidth: 14, fingerHeight: 10, boneWidth: 4, boneHeight: 2, boneOffsetY: 1 },
    'large finger': { fingerWidth: 30, fingerHeight: 22 },
    'no fingerprint ridges': { fingerprintRidgeHeight: 0 },
    'no dermal papillae': { epidermisDermisHeight: 0 },
    'smooth (no ridges, no papillae)': { fingerprintRidgeHeight: 0, epidermisDermisHeight: 0 },
    'wide fingerprint and papillae': { fingerprintAngularExtent: 180, epidermisDermisAngularExtent: 180 },
    'narrow fingerprint and papillae': { fingerprintAngularExtent: 10, epidermisDermisAngularExtent: 10 },
    'no angular extent': { fingerprintAngularExtent: 0, epidermisDermisAngularExtent: 0 },
    'short wavelengths': { fingerprintWavelength: 0.1, epidermisDermisWavelength: 0.1 },
    'long wavelengths': { fingerprintWavelength: 2, epidermisDermisWavelength: 3 },
    'tall ridges': { fingerprintRidgeHeight: 0.2 },
    'tall papillae': { epidermisDermisHeight: 0.5 },
    'no nail': { nailAngularExtent: 0 },
    'wide nail': { nailAngularExtent: 180 },
    'thick layers': { stratumCorneumThickness: 0.3, epidermisThickness: 1.0, dermisThickness: 1.2 },
    'no stratum corneum': { stratumCorneumThickness: 0 },
    'bone offset down': { boneOffsetY: -1.5 },
    'mesh variation': {}
};
const meshOverrides = {
    'mesh variation': { fineSize: 0.02, bulkSize: 0.5, fineDistance: 0.2, transitionDistance: 1.0, distanceSampling: 50 }
};

// Parameter sets that must fail validation, with identical messages in both builds.
const invalidCases = {
    'negative width': { fingerWidth: -3 },
    'zero height': { fingerHeight: 0 },
    'NaN width': { fingerWidth: NaN },
    'bone outside finger': { boneWidth: 25, boneHeight: 20 },
    'layers too thick': { stratumCorneumThickness: 3, epidermisThickness: 3, dermisThickness: 3 },
    'negative layer': { epidermisThickness: -0.1 },
    'nail too wide': { nailAngularExtent: 200 },
    'negative angular extent': { fingerprintAngularExtent: -5 },
    'wavelength too short': { fingerprintWavelength: 0.01 },
    'papillae taller than epidermis': { epidermisDermisHeight: 0.9 },
    'fine mesh larger than bulk': {},
    'bad transition distance': {},
    'bad distance sampling': {}
};
const invalidMesh = {
    'fine mesh larger than bulk': { fineSize: 0.5, bulkSize: 0.1 },
    'bad transition distance': { fineDistance: 0.5, transitionDistance: 0.2 },
    'bad distance sampling': { distanceSampling: 5 }
};

// 1. Static data
same('getDefaultParameters()', Geometry.getDefaultParameters(), core.getDefaultParameters());
same('TISSUE_COLORS', Geometry.TISSUE_COLORS, core.TISSUE_COLORS);

// 2. Valid parameter sets: validation passes and geometry is identical
for (const [name, overrides] of Object.entries(validCases)) {
    const params = withDefaults(overrides, meshOverrides[name]);
    const v = Geometry.validateParameters(params);
    if (!v.valid || !Geometry.validateMeshSettings(params.mesh).valid) {
        failures++;
        console.error('Test setup problem: case "' + name + '" is expected to be valid but is not: ' + json(v.errors));
        continue;
    }
    same('validateParameters: ' + name, v, core.validateParameters(params));
    same('validateMeshSettings: ' + name, Geometry.validateMeshSettings(params.mesh), core.validateMeshSettings(params.mesh));
    same('generateGeometry: ' + name, Geometry.generateGeometry(params), core.generateGeometry(params));
}

// 3. Invalid parameter sets: same errors
for (const [name, overrides] of Object.entries(invalidCases)) {
    const params = withDefaults(overrides, invalidMesh[name]);
    const bv = Geometry.validateParameters(params), cv = core.validateParameters(params);
    const bm = Geometry.validateMeshSettings(params.mesh), cm = core.validateMeshSettings(params.mesh);
    same('validateParameters: ' + name, bv, cv);
    same('validateMeshSettings: ' + name, bm, cm);
    if (bv.valid && bm.valid) {
        failures++;
        console.error('Test setup problem: case "' + name + '" is expected to be invalid but is valid');
    }
}

// 4. generate(): same result for valid input, same error message for invalid input
function outcome(fn) {
    try { return { ok: fn() }; } catch (e) { return { error: e.message }; }
}
for (const [name, overrides] of Object.entries(validCases)) {
    const input = { ...overrides, mesh: meshOverrides[name] };
    same('generate: ' + name, outcome(() => ParaFin.generate(input)), outcome(() => esmApi.generate(input)));
}
same('generate: undefined input', outcome(() => ParaFin.generate()), outcome(() => esmApi.generate()));
for (const [name, overrides] of Object.entries(invalidCases)) {
    const input = { ...overrides, mesh: invalidMesh[name] };
    const result = outcome(() => ParaFin.generate(input));
    if (!result.error) {
        failures++;
        console.error('Test setup problem: generate should throw for "' + name + '"');
    }
    same('generate error: ' + name, result, outcome(() => esmApi.generate(input)));
}

if (failures > 0) {
    console.error('\nParaFin geometry parity test FAILED (' + failures + ' mismatch' + (failures > 1 ? 'es' : '') + ').');
    console.error('js/geometry.js and js/geometry-core.js must contain the same algorithms.');
    process.exit(1);
}

console.log('ParaFin geometry parity test passed (' +
    (Object.keys(validCases).length + Object.keys(invalidCases).length) + ' parameter sets)');
