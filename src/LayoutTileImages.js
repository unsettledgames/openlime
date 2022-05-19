import { Layout } from './Layout.js';
import { BoundingBox } from './BoundingBox.js';
import { Tile } from './Tile.js';

class LayoutTileImages extends Layout {
    
    constructor(url, type, options) {
		super(url, null, options);
		this.setDefaults(type);
        this.init(url, type, options);

		// Contain array of records with at least visible,region,image (url of the image). 
		// Can be also a pointer to annotation array set from outside with setTileDescriptors()
        this.tileDescriptors = []; 
		
		if (url != null) {
			// Read data from annotation file
			this.loadDescriptors(url);
		}
	}

	async loadDescriptors(url) {
		// Load tile descriptors from annotation file
		let response = await fetch(url);
		if(!response.ok) {
			this.status = "Failed loading " + url + ": " + response.statusText;
			return;
		}
		this.tileDescriptors = await response.json();
		if(this.tileDescriptors.status == 'error') {
			alert("Failed to load annotations: " + this.tileDescriptors.msg);
			return;
		}
		//this.annotations = this.annotations.map(a => '@context' in a ? Annotation.fromJsonLd(a): a);
		this.tileDescriptors = this.tileDescriptors.map(a => new Annotation(a));
		for(let a of this.tileDescriptors)
			if(a.publish != 1)
				a.visible = false;

		if (this.path == null) {
			this.setPathFromUrl(url);
		}

		this.status = 'ready';
		this.emit('ready');
	}

	setPathFromUrl(url) {
		// Assume annotations in dir of annotation.json + /annot/
		const myArray = url.split("/");
		const N = myArray.length;
		this.path="";
		for(let i = 0; i < N-1; ++i) {
			this.path += myArray[i] + "/";
		}
		this.path += "/annot/";
	}

    setTileDescriptors(tileDescriptors) {
        this.tileDescriptors = tileDescriptors;
		
		this.status = 'ready';
		this.emit('ready');
    }

	/**
	 * Gets the URL of a specific tile. The function must be implemented for each layout type supported by OpenLIME.
	 * @param {number} id The channel id.
	 * @param {Tile} tile The tile.
	 */
	getTileURL(id, tile) {
		const url = this.path + '/' + this.tileDescriptors[id].image;
		return url;
	}

	setTileVisible(index, visible) {
		this.tileDescriptors[index].visible = visible;
	}

	setAllTilesVisible(visible) {
		const N = this.tileCount();

		for(let i = 0; i < N; ++i) {
			this.tileDescriptors[i].visible = visible;
		}
	}

    index(level, x, y) {
        // Map x to index (flat list)
        return x;
	}
    
    tileCoords(tile) {
		const r = this.tileDescriptors[tile.index].region;
        const x0 = r.x;
        const y0 = r.y
        const x1 = x0 + r.w;
        const y1 = y0 + r.h;

		return { 
			coords: new Float32Array([x0, y0, 0,  x0, y1, 0,  x1, y1, 0,  x1, y0, 0]),

            //careful: here y is inverted due to textures not being flipped on load (Firefox fault!).
			tcoords: new Float32Array([0, 1,      0, 0,       1, 0,        1, 1])
		};
	}

    needed(viewport, transform, border, bias, tiles, maxtiles = 8) {
		//look for needed nodes and prefetched nodes (on the pos destination
		let box = transform.getInverseBox(viewport);
		box.shift(this.width/2, this.height/2);

		let needed = [];
		let now = performance.now();

		// Linear scan of all the potential tiles
		const N = this.tileCount();
		const flipY = true;
		for (let x = 0; x < N; x++) {
			let index = this.index(0, x, 0);
			let tile = tiles.get(index) || this.newTile(index); 

			if (this.intersect(box, index, flipY)) {
				tile.time = now;
				tile.priority = this.tileDescriptors[index].visible ? 10 : 1;
				if (tile.missing === null) 
					needed.push(tile);
			}
		}
		let c = box.center();
		//sort tiles by distance to the center TODO: check it's correct!
		needed.sort(function (a, b) { return Math.abs(a.x - c[0]) + Math.abs(a.y - c[1]) - Math.abs(b.x - c[0]) - Math.abs(b.y - c[1]); });

		return needed;
    }

	/** returns the list of tiles available for a rendering */
	available(viewport, transform, border, bias, tiles) {
		//find box in image coordinates where (0, 0) is in the upper left corner.
		let box = transform.getInverseBox(viewport);
		box.shift(this.width/2, this.height/2);

		let torender = [];

		// Linear scan of all the potential tiles
		const N = this.tileCount();
		const flipY = true;
		for (let x = 0; x < N; x++) {
			let index = this.index(0, x, 0);

			if (this.tileDescriptors[index].visible && this.intersect(box, index, flipY)) {
				if (tiles.has(index)) {
					let tile = tiles.get(index); 
					if (tile.missing == 0) {
						torender[index] = tile;
					}
				}
			}
		}

		return torender;
	}

	newTile(index) {
		let tile = new Tile();
		tile.index = index;
		const r = this.tileDescriptors[index].region;
		tile.x = r.x;
		tile.y = r.y;
		tile.w = r.w;
		tile.h = r.h;
		return tile;
	}
	
	intersect(box, index, flipY = true) {
		const r = this.tileDescriptors[index].region
		const xLow = r.x;
        const yLow = r.y;
        const xHigh = xLow + r.w;
        const yHigh = yLow + r.h;
		const boxYLow = flipY ? -box.yHigh : box.yLow;
		const boxYHigh = flipY ? -box.yLow : box.yHigh;
		
		return xLow < box.xHigh  && yLow < boxYHigh && xHigh > box.xLow && yHigh > boxYLow;
	}

    /**
	 * Gets the layout bounding box.
	 * @returns {BoundingBox} The layout bounding box.
	 */
	boundingBox() {
		let bbox = new BoundingBox();
		for(let t of this.tileDescriptors) {
			if (t.visible) {
				const x0 = t.region.x;
				const y0 = t.region.y
				const x1 = x0 + t.region.w;
				const y1 = y0 + t.region.h;
				const tbox = new BoundingBox({xLow: x0, yLow: y0, xHigh: x1, yHigh: y1});
				bbox.mergeBox(tbox);
			}
		}
		return bbox;
	}

	tileCount() {
		return this.tileDescriptors.length;
	}

}

Layout.prototype.types['tile_images'] = (url, type, options) => { return new LayoutTileImages(url, type, options); };

export { LayoutTileImages }
