
function sum(a, b)  { return a.map((v, i) => v + b[i]); }
function diff(a, b) { return a.map((v, i) => v - b[i]); }
function mul(a, s) { return a.map(v => v*s); }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b) { return [ a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0] ]; }
function interp(a, b, t) { return a.map((v, i) => v*(1 - t) + b[i]*t ) }

function norm(a) {
	let n = 0;
	for(let v of a)
		n += Math.pow(v, 2);
	return Math.sqrt(n);
}


function matrixApply(m, v) {
	let x = v[0]*m[0] + v[1] *m[4] + v[2]*m[8]  +m[12];
	let y = v[0]*m[1] + v[1] *m[5] + v[2]*m[9]  +m[13];
	let z = v[0]*m[2] + v[1] *m[6] + v[2]*m[10] +m[14];
	let w = v[0]*m[3] + v[1] *m[7] + v[2]*m[11] +m[15];
	return [x/w, y/w, z/w];
}

function matrixMul(a, b) {
	let r = new Array(16);
	r[ 0] = a[0]*b[0] + a[4]*b[1] + a[8]*b[2] + a[12]*b[3];
	r[ 1] = a[1]*b[0] + a[5]*b[1] + a[9]*b[2] + a[13]*b[3];
	r[ 2] = a[2]*b[0] + a[6]*b[1] + a[10]*b[2] + a[14]*b[3];
	r[ 3] = a[3]*b[0] + a[7]*b[1] + a[11]*b[2] + a[15]*b[3];

	r[ 4] = a[0]*b[4] + a[4]*b[5] + a[8]*b[6] + a[12]*b[7];
	r[ 5] = a[1]*b[4] + a[5]*b[5] + a[9]*b[6] + a[13]*b[7];
	r[ 6] = a[2]*b[4] + a[6]*b[5] + a[10]*b[6] + a[14]*b[7];
	r[ 7] = a[3]*b[4] + a[7]*b[5] + a[11]*b[6] + a[15]*b[7];

	r[ 8] = a[0]*b[8] + a[4]*b[9] + a[8]*b[10] + a[12]*b[11];
	r[ 9] = a[1]*b[8] + a[5]*b[9] + a[9]*b[10] + a[13]*b[11];
	r[10] = a[2]*b[8] + a[6]*b[9] + a[10]*b[10] + a[14]*b[11];
	r[11] = a[3]*b[8] + a[7]*b[9] + a[11]*b[10] + a[15]*b[11];

	r[12] = a[0]*b[12] + a[4]*b[13] + a[8]*b[14] + a[12]*b[15];
	r[13] = a[1]*b[12] + a[5]*b[13] + a[9]*b[14] + a[13]*b[15];
	r[14] = a[2]*b[12] + a[6]*b[13] + a[10]*b[14] + a[14]*b[15];
	r[15] = a[3]*b[12] + a[7]*b[13] + a[11]*b[14] + a[15]*b[15];
	return r;
}


function invertMatrix(M) {

	let A2323 = M[10] * M[15] - M[11] * M[14];
    let A1323 = M[9] * M[15] - M[11] * M[13];
    let A1223 = M[9] * M[14] - M[10] * M[13];
    let A0323 = M[8] * M[15] - M[11] * M[12];
    let A0223 = M[8] * M[14] - M[10] * M[12];
    let A0123 = M[8] * M[13] - M[9] * M[12];
    let A2313 = M[6] * M[15] - M[7] * M[14];
    let A1313 = M[5] * M[15] - M[7] * M[13];
    let A1213 = M[5] * M[14] - M[6] * M[13];
    let A2312 = M[6] * M[11] - M[7] * M[10];
    let A1312 = M[5] * M[11] - M[7] * M[9];
    let A1212 = M[5] * M[10] - M[6] * M[9];
    let A0313 = M[4] * M[15] - M[7] * M[12];
    let A0213 = M[4] * M[14] - M[6] * M[12];
    let A0312 = M[4] * M[11] - M[7] * M[8];
    let A0212 = M[4] * M[10] - M[6] * M[8];
    let A0113 = M[4] * M[13] - M[5] * M[12];
    let A0112 = M[4] * M[9] - M[5] * M[8];

    let det = M[0] * ( M[5] * A2323 - M[6] * A1323 + M[7] * A1223 )
        - M[1] * ( M[4] * A2323 - M[6] * A0323 + M[7] * A0223 )
        + M[2] * ( M[4] * A1323 - M[5] * A0323 + M[7] * A0123 )
        - M[3] * ( M[4] * A1223 - M[5] * A0223 + M[6] * A0123 );
    det = 1 / det;

	return [
    	det *   ( M[5] * A2323 - M[6] * A1323 + M[7] * A1223 ),
    	det * - ( M[1] * A2323 - M[2] * A1323 + M[3] * A1223 ),
    	det *   ( M[1] * A2313 - M[2] * A1313 + M[3] * A1213 ),
    	det * - ( M[1] * A2312 - M[2] * A1312 + M[3] * A1212 ),
    	det * - ( M[4] * A2323 - M[6] * A0323 + M[7] * A0223 ),
    	det *   ( M[0] * A2323 - M[2] * A0323 + M[3] * A0223 ),
    	det * - ( M[0] * A2313 - M[2] * A0313 + M[3] * A0213 ),
    	det *   ( M[0] * A2312 - M[2] * A0312 + M[3] * A0212 ),
    	det *   ( M[4] * A1323 - M[5] * A0323 + M[7] * A0123 ),
    	det * - ( M[0] * A1323 - M[1] * A0323 + M[3] * A0123 ),
    	det *   ( M[0] * A1313 - M[1] * A0313 + M[3] * A0113 ),
    	det * - ( M[0] * A1312 - M[1] * A0312 + M[3] * A0112 ),
    	det * - ( M[4] * A1223 - M[5] * A0223 + M[6] * A0123 ),
    	det *   ( M[0] * A1223 - M[1] * A0223 + M[2] * A0123 ),
    	det * - ( M[0] * A1213 - M[1] * A0213 + M[2] * A0113 ),
    	det *   ( M[0] * A1212 - M[1] * A0212 + M[2] * A0112 )
	];
}


export { sum, diff, mul, interp, dot, cross, norm, matrixApply, matrixMul }