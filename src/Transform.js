/**
 *  The transform represent a 3d persective transform:
 *  (x, y, and h()) are eye position, looking at (x + tx, x + ty 0)  (in pixels)
 *   h in pixels combined with the screen width defines the fov w/h = sin(fov/2)
 *   a is the roll of the camera (in degrees)
 * 
 *  The transform projectsa point (x, y, z) to screen coordinates (X Y), all in pixels.
 *  2D images can be transformed in the plane just having tx and ty = 0.
 * 
 * To get the actual webgl matrix, we need the viewport.
 * 
 * @param {number} x position
 * @param {number} y position
 * @param {number} z scale
 * @param {number} a rotation in degrees
 * @param {number} t time
 *
 */

import { BoundingBox } from "./BoundingBox";

class Transform {
	constructor(options) {
		Object.assign(this, { x:0, y:0, z:1, a:0, t:0, tx: 0, ty: 0, h: 1 });

		this.viewMatrix = null;
		this.projectionMatrix = null; //transform between image coordinate space and screen space (in pixels, 0,0 centered)
		this.inverseProjectionMatrix = null;
		this.webGLMatrix = null;  //projectionMatrix but in normalized display coordinates.

		if(!this.t) this.t = performance.now();
		
		if(typeof(options) == 'object')
			Object.assign(this, options);
	}

	copy() {
		let transform = new Transform();
		Object.assign(transform, this);
		return transform;
	}

	apply(x, y) {

		let p = this.projectionMatrix();
		let v = matrixApply(p, [x, y, 0]);
		return {x: v[0], y: v[1]};
		
		//TODO! ROTATE
		let r = Transform.rotate(x, y, this.a);
		return { 
			x: r.x*this.z + this.x,
			y: r.y*this.z + this.y
		}
	}
	applyMatrix(m, y, x) {
		let v = matrixApply(m, [x, y, 0]);
		return {x: v[0], y: v[1]};
	}

	getInverseProjectionMatrix() {
		return inverseMatrix(this.projectionMatrix());

		let r = Transform.rotate(this.x/this.z, this.y/this.z, -this.a);
		return new Transform({x:-r.x, y:-r.y, z:1/this.z, a:-this.a, t:this.t});
	}

	static normalizeAngle(a) {
		while(a > 360) a -= 360;
		while(a < 0) a += 360;
		return a;
	}

	static rotate(x, y, angle) {
		angle = Math.PI*(angle/180);
		let ex =  Math.cos(angle)*x + Math.sin(angle)*y;
		let ey = -Math.sin(angle)*x + Math.cos(angle)*y;
		return {x:ex, y:ey};
	}

	// first get applied this (a) then  transform (b).
	compose(transform) {
		let t = new Transform();
		t.projectionMatrix = matrixMul(this.projectionMatrix, transform.projectionMatrix);
		t.inverseProjectionMatrix = t.getInverseProjectionMatrix();
		return t;

		let a = this.copy();
		let b = transform;
		a.z *= b.z;
		a.a += b.a;
		var r = Transform.rotate(a.x, a.y, b.a);
		a.x = r.x*b.z + b.x;
		a.y = r.y*b.z + b.y; 
		return a;
	}

	/* transform the box (for example -w/2, -h/2 , w/2, h/2 in scene coords) */
	transformBox(lbox) {
		let box = new BoundingBox();
		for(let i = 0; i < 4; i++) {
			let c = lbox.corner(i);
			let p = this.apply(c[0], c[1]);
			box.mergePoint(p);
		}
		return box;
	}

/*  get the bounding box (in image coordinate sppace) of the vieport. 
 */
	getInverseBox(viewport) {
		//let inverse = this.inverse();
		let corners = [
			{x:viewport.x,               y:viewport.y},
			{x:viewport.x + viewport.dx, y:viewport.y},
			{x:viewport.x,               y:viewport.y + viewport.dy},
			{x:viewport.x + viewport.dx, y:viewport.y + viewport.dy}
		];
		let box = new BoundingBox();
		for(let corner of corners) {
			//let p = inverse.apply(corner.x -viewport.w/2, corner.y - viewport.h/2);
			//let p = inverse.applyMatrix(inverse, corner.x -viewport.w/2, corner.y - viewport.h/2);
			let p = this.applyMatrix(this.inverseProjectionMatrix, corner.x -viewport.w/2, corner.y - viewport.h/2);
			box.mergePoint(p);
		}
		return box;
	}

	interpolate(source, target, time) {
		let t = (target.t - source.t);

		this.t = time;
		if(time < source.t) 
			return Object.assign(this, source);
		if(time > target.t || t < 0.0001) 
			return Object.assign(this, target);		

		let tt = (time - source.t)/t;
		let st = (target.t - time)/t;
		
		for(let i of ['x', 'y', 'z', 'a'])
			this[i] = (st*source[i] + tt*target[i]);
	}



/**
 *  Combines the transform with the viewport to the viewport with the transform
 * @param {Object} transform a {@link Transform} class.
 */
	getViewMatrix() {

		let h = this.h();
		let eye = [-this.x -this.y, h]; //this is actually -eye
		let target = [this.x + this.tx, this.y + ty, 0]
		let y = [target[0] + eye[0], target[1] + eye[1], target[2] + eye[2]]
		let z = [0, 0, 1]
		let x = cross(y, z);
		
		let matrix = [ 
			x[0], y[0], z[0], 0,
			x[1], y[1], z[1], 0,
			dot(x, eye), dot(y, eye), dot(z, eye), 1
		];
	}

	getProjectionMatrix() { 
		let f = this.z*this.h;
		let matrix = [ 
			f, 0, 0, 0,
			0, f, 0, 0,
			0, 0, 0, 0,
			0, 0, -1, 0];
		matrix = matrixMul(matrix, this.viewMatrix);
		return matrix;
/*		
		// In coords with 0 in lower left corner map x0 to -1, and x0+v.w to 1
		// In coords with 0 at screen center and x0 at 0, map -v.w/2 -> -1, v.w/2 -> 1 
		// With x0 != 0: x0 -> x0-v.w/2 -> -1, and x0+dx -> x0+v.dx-v.w/2 -> 1
		// Where dx is viewport width, while w is window width
		//0, 0 <-> viewport.x + viewport.dx/2 (if x, y =
		
		let zx = 2/viewport.dx;
		let zy = 2/viewport.dy;

		let dx =  zx * this.x + (2/viewport.dx)*(viewport.w/2-viewport.x)-1;
		let dy = -zy * this.y + (2/viewport.dy)*(viewport.h/2-viewport.y)-1;

		let a = Math.PI *this.a/180;
		let matrix = [
			 Math.cos(a)*zx*z, Math.sin(a)*zy*z,  0,  0, 
			-Math.sin(a)*zx*z, Math.cos(a)*zy*z,  0,  0,
			 0,  0,  1,  0,
			dx, dy, 0,  1];
		return matrix; */
	}

	webGLMatrix(viewport, near, far) {

		let ratio = h/w;
		let height = this.height(); 

		let l =  viewport.x - viewport.w/2;
		let r =  l + viewport.dx
		let b =  viewport.y - viewport.h/2;
		let t =  b + viewport.dy;

		let n = near;
		let f = far;

		let A =  - (f + n)/(f - n);
		let B = 2 * f * n/ (f - n);

		let matrix = [
			2*n/(r -l), 0, 0, 0,
			0, 2*n(t - b), 0, 0, 
			0, 0, A, B,
			0, 0, -1, 0
		];
		matrix = matrixMul(matrix, this.viewMatrix);
		return matrix;
	}

/**
 * TODO (if needed)
 */ 
	toMatrix() {
		let z = this.z;
		return [
			z,   0,   0,   0,
			0,   z,   0,   0, 
			0,   0,   1,   0,
			z*x, z*y, 0,   1,
		];
	}

    /**
	 * Transform p from scene (0 at image center) to [0,wh] 
	 * @param {*} viewport viewport(x,y,dx,dy,w,h)
	 * @param {*} p point in scene: 0,0 at image center
	 */ 
	sceneToViewportCoords(viewport, p) {
        return [p[0] * this.z  + this.x - viewport.x + viewport.w/2, 
                p[1] * this.z  - this.y + viewport.y + viewport.h/2 ];
    }

	/**
     * Transform p from  [0,wh] to scene (0 at image center)
	 * 
	 * @param {*} viewport viewport(x,y,dx,dy,w,h)
	 * @param {*} p point in range [0..w-1,0..h-1]
	 */
    viewportToSceneCoords(viewport, p) {
        return [(p[0] + viewport.x - viewport.w/2 - this.x) / this.z,
                (p[1] - viewport.y - viewport.h/2 + this.y) / this.z];

    }

}

function dot(a, b) {
	return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

function cross(a, b) {
	return [
		a[1]*b[2] - a[2]*b[1],
		a[2]*b[0] - a[0]*b[2],
		a[0]*b[1] - a[1]*b[0]
	];
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
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			r[j + i*4] = 0;
			for (let k = 0; k < N; k++) {
				r[j + i*4] += a[k + i*4]*b[k + j*4]
			}
		}
	}
	return r;
}

function matMul(a, b) {
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

	function m(r, c) { return M[4*r + c]; }
    let A2323 = m(2, 2) * m(3, 3) - m(2, 3) * m(3, 2);
    let A1323 = m(2, 1) * m(3, 3) - m(2, 3) * m(3, 1);
    let A1223 = m(2, 1) * m(3, 2) - m(2, 2) * m(3, 1);
    let A0323 = m(2, 0) * m(3, 3) - m(2, 3) * m(3, 0);
    let A0223 = m(2, 0) * m(3, 2) - m(2, 2) * m(3, 0);
    let A0123 = m(2, 0) * m(3, 1) - m(2, 1) * m(3, 0);
    let A2313 = m(1, 2) * m(3, 3) - m(1, 3) * m(3, 2);
    let A1313 = m(1, 1) * m(3, 3) - m(1, 3) * m(3, 1);
    let A1213 = m(1, 1) * m(3, 2) - m(1, 2) * m(3, 1);
    let A2312 = m(1, 2) * m(2, 3) - m(1, 3) * m(2, 2);
    let A1312 = m(1, 1) * m(2, 3) - m(1, 3) * m(2, 1);
    let A1212 = m(1, 1) * m(2, 2) - m(1, 2) * m(2, 1);
    let A0313 = m(1, 0) * m(3, 3) - m(1, 3) * m(3, 0);
    let A0213 = m(1, 0) * m(3, 2) - m(1, 2) * m(3, 0);
    let A0312 = m(1, 0) * m(2, 3) - m(1, 3) * m(2, 0);
    let A0212 = m(1, 0) * m(2, 2) - m(1, 2) * m(2, 0);
    let A0113 = m(1, 0) * m(3, 1) - m(1, 1) * m(3, 0);
    let A0112 = m(1, 0) * m(2, 1) - m(1, 1) * m(2, 0);

    det = m(0, 0) * ( m(1, 1) * A2323 - m(1, 2) * A1323 + m(1, 3) * A1223 )
        - m(0, 1) * ( m(1, 0) * A2323 - m(1, 2) * A0323 + m(1, 3) * A0223 )
        + m(0, 2) * ( m(1, 0) * A1323 - m(1, 1) * A0323 + m(1, 3) * A0123 )
        - m(0, 3) * ( m(1, 0) * A1223 - m(1, 1) * A0223 + m(1, 2) * A0123 );
    det = 1 / det;

	let im = [
    	det *   ( m(1, 1) * A2323 - m(1, 2) * A1323 + m(1, 3) * A1223 ),
    	det * - ( m(0, 1) * A2323 - m(0, 2) * A1323 + m(0, 3) * A1223 ),
    	det *   ( m(0, 1) * A2313 - m(0, 2) * A1313 + m(0, 3) * A1213 ),
    	det * - ( m(0, 1) * A2312 - m(0, 2) * A1312 + m(0, 3) * A1212 ),
    	det * - ( m(1, 0) * A2323 - m(1, 2) * A0323 + m(1, 3) * A0223 ),
    	det *   ( m(0, 0) * A2323 - m(0, 2) * A0323 + m(0, 3) * A0223 ),
    	det * - ( m(0, 0) * A2313 - m(0, 2) * A0313 + m(0, 3) * A0213 ),
    	det *   ( m(0, 0) * A2312 - m(0, 2) * A0312 + m(0, 3) * A0212 ),
    	det *   ( m(1, 0) * A1323 - m(1, 1) * A0323 + m(1, 3) * A0123 ),
    	det * - ( m(0, 0) * A1323 - m(0, 1) * A0323 + m(0, 3) * A0123 ),
    	det *   ( m(0, 0) * A1313 - m(0, 1) * A0313 + m(0, 3) * A0113 ),
    	det * - ( m(0, 0) * A1312 - m(0, 1) * A0312 + m(0, 3) * A0112 ),
    	det * - ( m(1, 0) * A1223 - m(1, 1) * A0223 + m(1, 2) * A0123 ),
    	det *   ( m(0, 0) * A1223 - m(0, 1) * A0223 + m(0, 2) * A0123 ),
    	det * - ( m(0, 0) * A1213 - m(0, 1) * A0213 + m(0, 2) * A0113 ),
    	det *   ( m(0, 0) * A1212 - m(0, 1) * A0212 + m(0, 2) * A0112 )
	];
	return im;
}

export { Transform, matMul }
