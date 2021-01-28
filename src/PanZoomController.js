import { Controller } from './Controller.js'
import { Camera } from './Camera.js'

class PanZoomController extends Controller {

	constructor(element, camera, options) {
		super(element, options);
		this.camera = camera;
		this.panning = false;
		this.startPosition = null;
		this.startMouse = null;
	}

	mouseDown(x, y, e) {
		if(!(e.buttons & 0x1)) 
			return;
		this.panning = true; 
		this.startMouse = { x: x, y: y };

		let now = performance.now();
		this.startPosition = this.camera.getCurrentTransform(now);
		this.camera.target = this.startPosition.copy(); //stop animation.
	}

	mouseUp(x, y, e) { 
		this.panning = false;
	}

	mouseMove(x, y, e) { 
		if(!this.panning)
			return;

		let dx = x - this.startMouse.x;
		let dy = y - this.startMouse.y;


		let z = this.startPosition.z;
		let ex = this.startPosition.x + dx/z;
		let ey = this.startPosition.y + dy/z;
		let a = this.startPosition.a;


		this.camera.setPosition(this.delay, ex, ey, z, a);

		if(this.debug1) console.log('Move ', x, y); 
	}

	zoomDelta(x, y, d, e) {  if(this.debug) console.log('Delta ', x, y, d); }

	zoomStart(pos1, pos2, e) {if(this.debug) console.log('ZStart ', pos1, pos2); }

	zoomMove(pos1, pos2, e) {if(this.debug) console.log('ZMove ', pos1, pos2); }

}

export { PanZoomController }
