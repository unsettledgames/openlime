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
            // CORRECT
            float vecToMorton(float r, float g, float b) {
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

            
            int modi(int x, int y) {
                return x - y * (x / y);
            }

            int and(int a, int b) {
                int result = 0;
                int n = 1;
            
                for(int i = 0; i < 8; i++) {
                    if ((modi(a, 2) == 1) && (modi(b, 2) == 1)) {
                        result += n;
                    }
            
                    a = a / 2;
                    b = b / 2;
                    n = n * 2;
            
                    if(!(a > 0 && b > 0)) {
                        break;
                    }
                }
                return result;
            }

            // BUG IS 100% HERE
            vec3 TransposeToHilbertCoords(vec3 col, int nbits)
            {
                int X[3];
                X[0] = int(col.x); X[1] = int(col.y); X[2] = int(col.z);

                int M = 1 << (nbits - 1), P, Q, t;

                // Inverse undo (bug is AT LEAST here)
                // Bug probably is that it's not possible to isolate the required bit in cond
                for (Q = M; Q > 1; Q /= 2) {
                    P = Q - 1;
                    for (int i = 0; i < 3; i++) {
                        int cond = and(X[i], Q);
                        if (cond != 0) // Invert
                            X[0] ^= P;
                        else { // Exchange
                            t = (X[0] ^ X[i]) & P;
                            X[0] ^= t;
                            X[i] ^= t;
                        }
                    }
                }
                
                // Gray encode
                for (int i = 1; i < 3; i++) X[i] ^= X[i - 1];
                t = 0;
                for (Q = M; Q > 1; Q >>= 1) {
                    int cond = and(X[3 - 1], Q);
                    if (cond != 0) t ^= Q - 1;
                }
                for (int i = 0; i < 3; i++) X[i] ^= t;

                return vec3(float(X[0]), float(X[1]), float(X[2]));
            }

            vec3 HilbertShrink(vec3 col) {
                int occupancy[256];

                int occSize = 0;
                int occLast = -1;
                vec3 ret = col;

                if(occSize == 0) {
                    occupancy[0] = 0;
                    occSize++;

                    int gap = 1;
                    while(gap < 64) {
                        int end = occSize;
                        int last = occupancy[occSize-1];
                        for(int i = 0; i < gap; i++) {
                            if(i <= gap/2) {
                                occupancy[occSize] = last;
                                occSize++;
                            }
                            else {
                                occupancy[occSize] = last+1;
                                occSize++;
                            }
                        }

                        for(int i = 0; i < end; i++) {
                            occupancy[occSize] = occupancy[i] + last+1;
                            occSize++;
                        }
                        gap *= 2;
                    }
                }
                for(int k = 0; k < 3; k++)
                    ret[k] = float(occupancy[int(ret[k])]);
                return ret;
            }

            float vecToHilbert(vec3 col)
            {
                vec3 v = col;
                //v = HilbertShrink(col);
                v = TransposeToHilbertCoords(v, 6);
                return vecToMorton(v.z, v.y, v.x);
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

            float contourLine(float height, float contourCount)
            {   
                float contourOffset = fract(height*contourCount);
                float nearestContourVerticalDistance = min(contourOffset, 1.-contourOffset)/contourCount;
                float screenSpaceSlope = 2. *length(vec2(dFdx(height), dFdy(height)));
                float screenSpaceDistance = nearestContourVerticalDistance/screenSpaceSlope;
                return 1. - smoothstep(0., 1., screenSpaceDistance);
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
                        d = vecToMorton(r * 255.0, g * 255.0, b * 255.0) / (65535.0);
                        break;
                    }
                    case 2:
                    {
                        d = vecToHilbert(col.xyz * 255.0) / (65535.0);
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

                // Contour lines
                /*float contour = contourLine(d, float(${this.uniformName("nCurves")}));
                float grayscaleColor = d*(1.0-contour);
                
                return vec4(vec3(grayscaleColor), 1.0);*/

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