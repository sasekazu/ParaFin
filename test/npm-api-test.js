import ParaFin, {
    generate,
    getDefaultParameters
} from '../js/parafin-api.esm.js';

const defaults = getDefaultParameters();
const result = generate({
    fingerWidth: defaults.fingerWidth
});

if (!result.boundaries || !result.regions) {
    throw new Error('Geometry generation failed');
}

const defaultResult = ParaFin.generate({});

if (!defaultResult.boundaries) {
    throw new Error('Default export failed');
}

// Invalid parameters should throw a descriptive Error, not return a partial shape.
let threw = false;
try {
    ParaFin.generate({ fingerWidth: -5 });
} catch (e) {
    threw = true;
}
if (!threw) {
    throw new Error('Expected ParaFin.generate to throw for invalid parameters');
}

console.log('ParaFin npm API test passed');
