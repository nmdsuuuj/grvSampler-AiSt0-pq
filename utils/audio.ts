
// Shared Audio Utilities

export const makeDistortionCurve = (type: string, amount: number): Float32Array => {
    const k = amount;
    const n_samples = 4096;
    const curve = new Float32Array(n_samples);
    const pi = Math.PI;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        switch(type) {
            case 'Hard Clip': curve[i] = Math.max(-1, Math.min(1, x * (1 + k * 10))); break;
            case 'Soft Clip': curve[i] = Math.tanh(x * (1 + k * 4)); break;
            case 'Bitcrush': const bits = Math.round(16 * (1 - k)); const steps = Math.pow(2, Math.max(1, bits)); curve[i] = Math.round(x * steps) / steps; break;
            case 'Foldback': curve[i] = Math.sin(x * (1 + k * 10)); break;
            case 'Arctan': curve[i] = Math.atan(x * (1 + k * 10)) / (pi / 2); break;
            case 'Tanh': curve[i] = Math.tanh(x * (1 + k * 10)); break;
            case 'Sine Warp': curve[i] = Math.sin(pi * x * (1 + k)); break;
            case 'Half Rectify': curve[i] = Math.max(0, x); break;
            case 'Full Rectify': curve[i] = Math.abs(x); break;
            case 'Gloubi': const a = 1 + k * 100; curve[i] = (x > 0 ? 1 : -1) * (1 - Math.exp(-a * Math.abs(x))); break;
            case 'Expo Clip': curve[i] = (x > 0 ? 1 : -1) * (1 - Math.exp(-Math.abs(x) * (1 + k * 5))); break;
            case 'Hard Limit': curve[i] = Math.max(-1 + k, Math.min(1 - k, x)); break;
            case 'Germanium': curve[i] = x < 0.2 ? x : 0.2 + (x - 0.2) * (0.1 + 0.9 * (1 - k)); break;
            case 'Silicon': curve[i] = x < 0.7 ? x : 0.7 + (x - 0.7) * (0.01 + 0.99 * (1 - k)); break;
            case 'Tube': const q = x / (1 - k * 0.9); curve[i] = q / (1 + Math.abs(q)) / (1 / (1 + Math.abs(1))); break;
            case 'Fuzz': const blend = x * (k * 10 + 1); curve[i] = (blend > 0 ? 1 : -1) * (1 - Math.exp(-Math.abs(blend))); break;
            case 'Diode': const vd = 0.2, vt = 0.025; curve[i] = x > vd ? x - vd : (vt * Math.log(1 + x/vt)); break;
            case 'Chebyshev': const cheby_n = 2 + Math.floor(k * 8); let cheby_x = x; let T0 = 1, T1 = x, Tn = 0; for(let j=2; j<=cheby_n; j++) { Tn = 2*x*T1 - T0; T0 = T1; T1 = Tn; } curve[i] = T1; break;
            case 'Resampler': const rate = Math.pow(2, Math.floor(k * 6)); curve[i] = Math.floor(x * rate) / rate; break;
            case 'Asymmetric': curve[i] = x > 0 ? Math.tanh(x * (1 + k * 5)) : Math.tanh(x * (1 + (k/2) * 5)); break;
            case 'Phase Shift': curve[i] = Math.sin(x*pi + k*pi); break;
            case 'Quantize': const levels = 2 + Math.floor(k * 30); curve[i] = Math.round(x * levels) / levels; break;
            case 'S-Curve': curve[i] = (3 * x - Math.pow(x, 3)) / 2; break;
            case 'Crossover': const cross_thresh = k; curve[i] = Math.abs(x) < cross_thresh ? 0 : x; break;
            case 'Saturator': curve[i] = x / (1 - k + k * Math.abs(x)); break;
            case 'Digital OD': const digi_k = 1-k; curve[i] = x > digi_k ? digi_k : (x < -digi_k ? -digi_k : x); break;
            case 'Tape': curve[i] = Math.tanh(x + k * Math.pow(x, 3)); break;
            case 'Transistor': const vbe = 0.7; curve[i] = x < vbe ? 0 : x - vbe * (1-k); break;
            case 'Diode Rectify': curve[i] = x > 0 ? x * (1 - k) : 0; break;
            case 'Sine Fold': curve[i] = Math.sin(x*pi*(1 + k*5)); break;
            case 'Crush Fold': const crush_bits = Math.round(16 * (1 - k)); const crush_steps = Math.pow(2, Math.max(1, crush_bits)); const crushed = Math.round(x * crush_steps) / crush_steps; curve[i] = Math.sin(crushed * pi * 5); break;
            case 'Parabolic Shaper': curve[i] = x * (1 + k) - k * x * Math.abs(x); break;
            default: curve[i] = x; break;
        }
    }
    return curve;
};
