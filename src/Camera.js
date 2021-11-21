import { Transform } from './Transform.js'
import { BoundingBox } from './BoundingBox.js'
import { sum, diff, mul, norm, cross, interp, matrixMul } from './Math.js'

/**
 *  NOTICE TODO: the camera has the transform relative to the whole canvas NOT the viewport.
 * @param {object} options
 * * *bounded*: limit translation of the camera to the boundary of the scene.
 * * *maxZoom*: maximum zoom, 1:maxZoom is screen pixel to image pixel ratio.
 * * *minZoom*: minimum zoom,
 * * *minScreenFraction: the minimum portion of the screen to zoom in
 * * *maxFixedZoom: maximum pixel size
 * Signals:
 * Emits 'update' event when target is changed.
 */


class View {
	constructor(options) {
		Object.assign(this, {
			eye: [0, 0, 1],
			target: [0, 0, 0], 
			up: [0, 1, 0],
			t: 0,
			matrix: null,
			inverse: null
		}, options)
	}
	
	copy() {
		return new View({
			eye: [...this.eye],
			target: [...this.target],
			up: [...this.up],
		});
	}
	//if zoom bigger than one the position get closer
	zoom(dz) {
		//this.position = sum(mul(diff(this.position, this.offset), 1/dz), this.offset);
		this.eye = sum(this.eye, mul(this.target, 1 - 1/dz));
		this.matrix = this.inverse = null;
	}
	pan(dx, dy) {
		this.eye[0] += dx;
		this.eye[1] += dy;
		this.target[0] += dx;
		this.target[1] += dy;
		this.matrix = this.inverse = null;
	}

	interpolate(source, target, time) {
		let t = (target.t - source.t);

		this.t = time;
		if(time < source.t) 
			return Object.assign(this, source.copy());
		if(time > target.t || t < 0.0001) 
			return Object.assign(this, target.copy());		

		let tt = (time - source.t)/t;
		
		for(let i of ['eye', 'target', 'up'])
			this[i] = interp(source[i], target[i], tt);
		this.matrix = this.inverse = null;
	}

	project(p){
		if(!this.matrix)
			this.lookAt();
		return applyMatrix(this.matrix, p)
	}

	unproject(p) {
		if(!this.matrix)
			this.loookAt();
		return applyMatrix(this.inverse, p);
	}

	lookAt() {
		let viewdir = diff(this.eye, this.target);	
		let length = norm(viewdir);
		if(length === 0)
			throw "Eye and target are in the same position";

		viewdir = mul(viewdir, 1/length);
		let dx = cross(this.up, viewdir);
		length = norm(dx);
		if(length == 0)
			throw "up and view direction are parallel";

		dx = mul(dx, 1/length);
		let dy = cross(viewdir, dx);
		let dz = viewdir;
		this.matrix = [ dx[0], dx[1], dx[2], 0,
		            	dy[0], dy[1], dy[2], 0,
						dz[0], dz[1], dz[2], 0,
					    	0,     0,     0, 1];
		this.inverse = [ dx[0], dy[0], dz[0], 0,
						 dx[1], dy[1], dz[1], 0,
						 dx[2], dy[2], dz[2], 0,
							 0,     0,     0, 1];
	}
	getMatrix() {
		this.lookAt();
		return this.matrix;
	}
}

class Camera {

	constructor(options) {
		Object.assign(this, {
			viewport: null,
			aspect: 1, //w/h
			fov: 60,
			near: 0.1,
			far: 10,
			matrix: null,
			inverse: null,

			bounded: true,
			minScreenFraction: 1,
			maxFixedZoom: 2,
			maxZoom: 2,
			minZoom: 1,
			boundingBox: new BoundingBox, //this is actuallt the scene bounding box.

			animating: true,
			signals: {'update':[]}
		}, options);

		this.target = new View(this.target); //new Transform(this.target);
		this.source = this.target.copy();
	}

	addEvent(event, callback) {
		this.signals[event].push(callback);
	}

	emit(event) {
		for(let r of this.signals[event])
			r(this);
	}

/**
 *  Set the viewport and updates the camera for an as close as possible.
 */
	setViewport(viewport) {
		if(this.viewport) {
			let rz = Math.sqrt((viewport.w/this.viewport.w)*(viewport.h/this.viewport.h));

			this.source.zoom(rz);
			this.target.zoom(rz);
		}
		this.aspect = viewport.w / viewport.h;
		this.viewport = viewport;
		this.emit('update');
	}

	setView(view, dt) {
		if(!dt) dt = 0;
		if(this.bounded)
			this.bound(view);

		let now = performance.now();
		this.source = this.getCurrentView(now);
		this.target = view.copy();
		this.target.t = now + dt;
		this.emit('update');
	}

	bound(view) {
		return;

		/*if (this.bounded) {
			const sw = this.viewport.dx;
			const sh = this.viewport.dy;

			//
			let xform = new Transform({x:x, y:y, z:z, a:a,t:0});
			let tbox = xform.transformBox(this.boundingBox);
			const bw = tbox.width();
			const bh = tbox.height();

			// Screen space offset between image boundary and screen boundary
			// Do not let transform offet go beyond this limit.
			// if (scaled-image-size < screen) it remains fully contained
			// else the scaled-image boundary closest to the screen cannot enter the screen.
			const dx = Math.abs(bw-sw)/2;
			x = Math.min(Math.max(-dx, x), dx);

			const dy = Math.abs(bh-sh)/2;
			y = Math.min(Math.max(-dy, y), dy);
		}*/
	}


	getCurrentView(time) {
		if(!time) time = performance.now();
		let pos;
		if(time < this.source.t)
			pos = this.source.copy()
		if(time >= this.target.t) {
			pos = this.target.copy()
			this.animating = false;
		} else {
			pos = new View();
			pos.interpolate(this.source, this.target, time);
		}

		pos.t = time;
		return pos;
	}

	//Viewport coords are from [0, 0, w, h] of the <canvas> top left
	//Canvas coords are the viewport but 0, 0 is in the center of the screen and y axis points up.
	//Scene is where the layers are placed, centered in 0, 0 usually.
	viewportToScene(x, y) {
		x = x + this.viewport.x - this.viewport.w/2;
		y = y - this.viewport.y - this.viewport.h/2;
		return this.canvasToScene([x, y, 0]);
	}

	sceneToViewport(x, y) {
		let pos = sceneToCanvas([x, y, 0]);
		return [pos[0] - this.viewport.x + this.viewport.w/2,
				pos[1] + this.viewport.y + this.viewport.h/2]
	}

	canvasToScene(pos) {
		pos = this.unproject(pos);
		let current = this.getCurrentView();
		return current.unproject(pos);
	}
	sceneToCanvas(pos) {
		let current = this.getCurrentView();
		pos = current.project(pos);
		pos = this.project(pos);
	}



/*
 * Pan the camera 
 * @param {number} dx move the camera by dx pixels (positive means the image moves right).
 */
	pan(dx, dy, initialView, dt) {
		let d  = this.viewportToScene([dx, dy, 0])
		let panned = view.copy();
		panned.pan(d[0], d[1]);
		this.setView(view, dt);
	}
/* zoom in or zoom out around the x, y point (in pixels, viewport coords)
*/
	zoom(dz, x, y, dt) {
		let view = this.getCurrentView();
		let pos = this.viewportToScene([x, y, 0]);
		view.zoom(dz);
		this.setView(view, dt);
	}

/* zoom in or out at a specific point in canvas coords!
 * TODO: this is not quite right!
 
	zoom(dt, z, x, y) {
		if(!x) x = 0;
		if(!y) y = 0;

		let now = performance.now();
		let m = this.getCurrentTransform(now);

		if (this.bounded) {
			z = Math.min(Math.max(z, this.minZoom), this.maxZoom);
		}

		//x, an y should be the center of the zoom.
		m.x += (m.x+x)*(m.z - z)/m.z;
		m.y += (m.y+y)*(m.z - z)/m.z;

		this.setPosition(dt, m.x, m.y, z, m.a);
	} */

/*	rotate(dt, a) {

		let now = performance.now();
		let m = this.getCurrentTransform(now);

		this.setPosition(dt, m.x, m.y, m.z, this.target.a + a);
	} */

/*	deltaZoom(dt, dz, x, y) {
		if(!x) x = 0;
		if(!y) y = 0;

		let now = performance.now();
		let m = this.getCurrentTransform(now);


		//rapid firing wheel event need to compound.
		//but the x, y in input are relative to the current transform.
		dz *= this.target.z/m.z;

		if (this.bounded) {
			if (m.z*dz < this.minZoom) dz = this.minZoom / m.z;
			if (m.z*dz > this.maxZoom) dz = this.maxZoom / m.z;
		}

		//transform is x*z + dx = X , there x is positrion in scene, X on screen
		//we want x*z*dz + dx1 = X (stay put, we need to find dx1.
		let r = Transform.rotate(x, y, m.a);
		m.x += r.x*m.z*(1 - dz);
		m.y += r.y*m.z*(1 - dz);

		
		this.setPosition(dt, m.x, m.y, m.z*dz, m.a);
	} */

/**
 * @param {Array} box fit the specified rectangle [minx, miny, maxx, maxy] in the canvas.
 * @param {number} dt animation duration in millisecond 
 * @param {string} size how to fit the image: <contain | cover> default is contain (and cover is not implemented
 */

	fit(box, dt) {
		if (box.isEmpty()) return;
		if(!dt) dt = 0;

		//find if we align the topbottom borders or the leftright border.
		let w = this.viewport.dx;
		let h = this.viewport.dy;


		let bw = box.width();
		let bh = box.height();
		let c = box.center();
		let z = Math.min(w/bw, h/bh);
		let sideHeightRatio = Math.tan(0.5*this.fov*Math.PI/180);  //=halfside/h
		//side is always 1 anyway.
		//z =number of pixels in viewport/units of the box.
		//z * bw = side in pixels
		let eyeh = z*bw / Math.tan(0.5*this.fov*Math.PI/180);

		let view = new View({
			eye: [-c[0], -c[1], eyeh], 
			target: [-c[0], -c[1], 0] 
		});
		this.setView(view, dt);
		console.log(view);
	}


	fitCameraBox(dt) {
		this.fit(this.boundingBox, dt);
	}

	updateBounds(box, minScale) {
		this.boundingBox = box;
		const w = this.viewport.dx;
		const h = this.viewport.dy;

		let bw = this.boundingBox.width();
		let bh = this.boundingBox.height();
	
		this.minZoom = Math.min(w/bw, h/bh) * this.minScreenFraction;
		this.maxZoom = minScale > 0 ? this.maxFixedZoom / minScale : this.maxFixedZoom;
		this.maxZoom = Math.max(this.minZoom, this.maxZoom);
	}

	//perspective transform
	getProjectionMatrix() {
		let top = this.near * Math.tan( 0.5 * this.fov * Math.PI / 180);
		let height = 2 * top;
		let width = this.aspect * height;
		let left = - 0.5 * width;
		
		return this.makePerspective( left, left + width, top, top - height, this.near, this.far );

	}
	//perspective transform combined with current view
	getProjectionViewMatrix() {
		let proj = this.getProjectionMatrix();
		let view = this.getCurrentView();
		let m = view.getMatrix();
		return matrixMul(proj, m);
	}

	////projectionView + transform matrix
	getMatrix(transform) { 
		let projview = this.getProjectionViewMatrix();
		let m = transform.getMatrix();
		return matrixMul(projview, m);
	}

	makePerspective( left, right, top, bottom, near, far ) {
		const x = 2 * near / ( right - left );
		const y = 2 * near / ( top - bottom );

		const a = ( right + left ) / ( right - left );
		const b = ( top + bottom ) / ( top - bottom );
		const c = - ( far + near ) / ( far - near );
		const d = - 2 * far * near / ( far - near );

		return [x, 0, 0, 0,
				0, y, 0, 0,
				a, b, c, -1,
				0, 0, d, 0];
	}
}

export { Camera }
