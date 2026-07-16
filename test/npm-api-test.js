import ParaFing, {
    generate,
    getDefaultParameters
} from '../js/parafing-api.esm.js';

const defaults = getDefaultParameters();
const result = generate({
    fingerWidth: defaults.fingerWidth
});

if (!result.boundaries || !result.regions) {
    throw new Error('Geometry generation failed');
}

const defaultResult = ParaFing.generate({});

if (!defaultResult.boundaries) {
    throw new Error('Default export failed');
}

// Invalid parameters should throw a descriptive Error, not return a partial shape.
let threw = false;
try {
    ParaFing.generate({ fingerWidth: -5 });
} catch (e) {
    threw = true;
}
if (!threw) {
    throw new Error('Expected ParaFing.generate to throw for invalid parameters');
}

console.log('ParaFing npm API test passed');
