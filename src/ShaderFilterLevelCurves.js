import { ShaderFilter } from "./ShaderFilter";

class ShaderFilterLevelCurves extends ShaderFilter {
    constructor(options) {
        super(options);

        this.encoding = 0;
        this.min = 0;
        this.max = 0;
        this.p = 1;
        this.nCurves = options.nCurves;
        this.thickness = options.thickness;
        this.strokeColor = options.strokeColor;

        this.uniforms[this.uniformName("min")] = {type: 'float', needsUpdate: true, size: 1, value: this.min};
        this.uniforms[this.uniformName("max")] = {type: 'float', needsUpdate: true, size: 1, value: this.max};
        this.uniforms[this.uniformName("encoding")] = {type: 'int', needsUpdate: true, size: 1, value: this.encoding};
        this.uniforms[this.uniformName("nCurves")] = {type: 'int', needsUpdate: true, size: 1, value: this.nCurves};
        this.uniforms[this.uniformName("thickness")] = {type: 'float', needsUpdate: true, size: 1, value: this.thickness};
        this.uniforms[this.uniformName("strokeColor")] = {type: 'vec4', needsUpdate: true, size: 4, value: this.strokeColor};
        this.uniforms[this.uniformName("p")] = {type: 'float', needsUpdate: true, size: 1, value: this.p};

        this.url = options.url;
        this.init();
    }

    init() {
        (async () => {
			let json = "";
			try {
				let url = this.url.substring(0, this.url.lastIndexOf("/")+1) + "info.json";
				let response = await fetch(url);
				console.log(response.ok);
				json = await response.json();

                this.uniforms[this.uniformName("min")].needsUpdate = true;
                this.uniforms[this.uniformName("min")].value = json['min'];

                this.uniforms[this.uniformName("max")].needsUpdate = true;
                this.uniforms[this.uniformName("max")].needsUpdate = json['max'];

                this.uniforms[this.uniformName("p")].needsUpdate = true;
                this.uniforms[this.uniformName("p")].value = 0.0078;//json['p'];
                
                this.uniforms[this.uniformName("encoding")].needsUpdate = true;
                this.uniforms[this.uniformName("encoding")].value = this.encodingStringToInt(json['encoding']);
			}
			catch (error) {
                console.error("Configuration file for heightmap ", this.url, " missing or corrupted");
			}
		})();
    }

    encodingStringToInt(str) {
        switch (str) {
            case "None": return 0;
            case "Morton": return 1;
            case "Hilbert": return 2;
            case "Triangle": return 3;
            default: return 0;
        }
    }

    // Uniform declarations in shader program 
    fragUniformSrc() {
        return `
            uniform float ${this.uniformName("min")};
            uniform float ${this.uniformName("max")};
            uniform int ${this.uniformName("nCurves")};
            uniform float ${this.uniformName("thickness")};
            uniform vec4 ${this.uniformName("strokeColor")};
            uniform float ${this.uniformName("p")};
            uniform int ${this.uniformName("encoding")};
        `;
    }

    fragDataSrc(gl) {
        return `
            vec3 ${this.functionName()}transposeToHilbertCoords(vec3 data, int nBits, int nComps) {
                int M = 1 << (nBits - 1), P, Q, t;
                ivec3 ret = ivec3(int(data.x), int(data.y), int(data.z));

                // Inverse undo
                for (Q = M; Q > 1; Q >>= 1) {
                    P = Q - 1;
                    for (int i = 0; i < nComps; i++)
                        if ((ret[i] & Q) == 1) // Invert
                            ret[0] ^= P;
                        else { // Exchange
                            t = (ret[0] ^ ret[i]) & P;
                            ret[0] ^= t;
                            ret[i] ^= t;
                        }
                }

                // Gray encode
                for (int i = 1; i < nComps; i++) ret[i] ^= ret[i - 1];
                t = 0;
                for (Q = M; Q > 1; Q >>= 1)
                    if ((ret[nComps - 1] & Q) == 1) t ^= Q - 1;
                for (int i = 0; i < nComps; i++) ret[i] ^= t;

                return vec3(float(ret.x),float(ret.y),float(ret.z));
            }

            float ${this.functionName()}vecToMorton(float r, float g, float b) {
                int nbits = 6;
                int nbits2 = 2 * nbits;
                
                int x = int(r), y = int(g), z = int(b);
                int codex = 0, codey = 0, codez = 0;

                for (int i = 0, andbit = 1; i < nbits2; i += 2, andbit <<= 1) {
                    codex |= (x & andbit) << i;
                    codey |= (y & andbit) << i;
                    codez |= (z & andbit) << i;
                }

                return float((codez << 2) | (codey << 1) | codex);
            }

            float ${this.functionName()}vecToHilbert(float r, float g, float b) {
                int nbits = 6;

                vec3 v = ${this.functionName()}transposeToHilbertCoords(vec3(r,g,b), nbits, 3);
                return ${this.functionName()}vecToMorton(v.z, v.y, v.x);
            }

            float ${this.functionName()}mod(float x, float y) {
                return x - y * floor(x / y);
            }

            int ${this.functionName()}m(float L) {
                return int(floor(4.0 * (L / ${this.uniformName("p")}) - 0.5)) % 4;
            }

            float ${this.functionName()}L0(float L, float m) {
                return L - (${this.functionName()}mod(L - ${this.uniformName("p")}/8.0f, ${this.uniformName("p")})) +
                (${this.uniformName("p")} / 4.0) * m - ${this.uniformName("p")} / 8.0;
            }
            
            float ${this.functionName()}delta(float L, float Ha, float Hb, int m) {
                switch (m) {
                    case 0:
                        return (${this.uniformName("p")} * Ha)/2.0;
                    case 1:
                        return (${this.uniformName("p")} * Hb)/2.0;
                    case 2:
                        return (${this.uniformName("p")} * (1.0 - Ha))/2.0;
                    case 3:
                        return (${this.uniformName("p")} * (1.0 - Hb))/2.0;
                }
            }

            float decodeTriangle(float r, float g, float b) {
                float L = r, Ha = g, Hb = b;
                int m = ${this.functionName()}m(L);
                float L0 = ${this.functionName()}L0(L, float(m));
                return (L0 + ${this.functionName()}delta(L, Ha, Hb, m));
            }

            vec4 ${this.functionName()}(vec4 col) {
                float d;

                switch (${this.uniformName("encoding")}) {
                    case 0:
                        d = col.r;
                        break;
                    case 1:
                    {
                        float r = col.r, g = col.g, b = col.b;
                        d = ${this.functionName()}vecToMorton(r * 255.0, g * 255.0, b * 255.0) / (65535.0);
                        break;
                    }
                    case 2:
                    {
                        float r = col.r, g = col.g, b = col.b;
                        d = ${this.functionName()}vecToHilbert(r * 255.0, g * 255.0, b * 255.0) / (65535.0);
                        break;
                    }
                    case 3:
                    {
                        d = decodeTriangle(col.r, col.g, col.b);
                        break;
                    }
                    default:
                        d = col.r;
                        break;
                }

                // D now contains a 16 bit depth value quantized to [0,1]
                vec3 position = vec3(v_texcoord, d);
                float nCurves = 16.0;//float(${this.uniformName("nCurves")});
                float step = 1.0 / nCurves;
                float currHeight = 0.0;
                float fraction = 1.0 / 512.0;

                vec4 top = textureOffset(kd, v_texcoord, ivec2(0, 1));
                vec4 bottom = textureOffset(kd, v_texcoord, ivec2(0, -1));
                vec4 left = textureOffset(kd, v_texcoord, ivec2(-1, 0));
                vec4 right = textureOffset(kd, v_texcoord, ivec2(1, 0));

                while (currHeight < 1.0) {
                    float nIncluded = 0.0;
                    nIncluded += abs(currHeight - decodeTriangle(top.r, top.g, top.b)) < fraction ? 1.0 : 0.0;
                    nIncluded += abs(currHeight - decodeTriangle(bottom.r, bottom.g, bottom.b)) < fraction ? 1.0 : 0.0;
                    nIncluded += abs(currHeight - decodeTriangle(left.r, left.g, left.b)) < fraction ? 1.0 : 0.0;
                    nIncluded += abs(currHeight - decodeTriangle(right.r, right.g, right.b)) < fraction ? 1.0 : 0.0;
                    nIncluded /= 4.0;

                    vec3 col = mix(vec3(d), ${this.uniformName("strokeColor")}.xyz, 1.0 - nIncluded);

                    float diff = abs(currHeight - d);
                    if (diff < fraction)
                        return vec4(col, 1.0);
                    currHeight += step;
                }

                return vec4(vec3(d), 1.0);
            }
        `;
    }

    getSampler(name) {
        const samplername = this.samplerName(name);
        return this.samplers.find(e => e.name == samplername);
    }
}

export { ShaderFilterLevelCurves }