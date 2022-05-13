import { Layout } from './Layout.js';
import { BoundingBox } from './BoundingBox.js';
import { Tile } from './Tile.js';

class LayoutTileImages extends Layout {
    
    constructor(url, type, options) {
		super(url, null, options);
		this.setDefaults(type);
        this.init(url, type, options);
        this.locations = []; // x,y,w,h for each tile
		this.activeTiles = [];
	}

    setTileLocations(locations) {
        this.locations = locations;

		// Compute width height of the all images
		// let xLow = 100000;
		// let yLow = 100000;
		// let xHigh = -10000;
		// let yHigh = -10000;
		// for(let l of this.locations) {
		// 	xLow = Math.min(xLow, l.x);
		// 	yLow = Math.min(yLow, l.y);
		// 	xHigh = Math.max(xHigh, l.x+l.w);
		// 	yHigh = Math.max(yHigh, l.y+l.h);

		// 	this.activeTile[counter] = false;
		// }
		// this.width = xHigh - xLow;
		// this.height = yHigh - yLow;
    }

	setActiveTile(index, active) {
		this.activeTiles[index] = active;
	}

	setActiveAllTiles(active) {
		const N = this.activeTiles.length;
		for(let i = 0; i < N; ++i) {
			this.activeTiles[i] = active;
		}
	}

    index(level, x, y) {
        // Map x to index (flat list)
        return x;
	}
    
    tileCoords(tile) {
		const l = this.locations[tile.index];
        const x0 = l.x;
        const y0 = l.y
        const x1 = x0 + l.w;
        const y1 = y0 + l.h;

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
		const N = this.locations.length;
		const flipY = true;
		for (let x = 0; x < N; x++) {
			let index = this.index(0, x, 0);
			let tile = tiles.get(index) || this.newTile(index); 

			if (this.intersect(box, this.locations[index], flipY)) {
				tile.time = now;
				tile.priority = this.activeTiles[index] ? 10 : 1;
				if (tile.missing === null) // || tile.missing != 0 && !this.requested[index])
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
		const N = this.locations.length;
		const flipY = true;
		for (let x = 0; x < N; x++) {
			let index = this.index(0, x, 0);

			if (this.activeTiles[index] && this.intersect(box, this.locations[index], flipY)) {
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
		const l = this.locations[index];
		tile.x = l.x;
		tile.y = l.y;
		tile.w = l.w;
		tile.h = l.h;
		return tile;
	}
	
	intersect(box, tileLocation, flipY = true) {
		const xLow = tileLocation.x;
        const yLow = tileLocation.y;
        const xHigh = xLow + tileLocation.w;
        const yHigh = yLow + tileLocation.h;

		if (flipY) {
			const tmp = box.yHigh;
			box.yHigh = -box.yLow;
			box.yLow = -tmp;
		}

		return xLow < box.xHigh  && yLow < box.yHigh && xHigh > box.xLow && yHigh > box.yLow;
	}

    /**
	 * Gets the layout bounding box.
	 * @returns {BoundingBox} The layout bounding box.
	 */
	boundingBox() {
		const N = this.locations.length;
		if(N == 0) throw "Layout not initialized still";

		let bbox = new BoundingBox();
		for(let i = 0; i < N; ++i) {
			if (this.activeTiles[i]) {
				const l = this.locations[i];
				const x0 = l.x;
				const y0 = l.y
				const x1 = x0 + l.w;
				const y1 = y0 + l.h;
				const tbox = new BoundingBox({xLow: x0, yLow: y0, xHigh: x1, yHigh: y1});
				bbox.mergeBox(tbox);
			}
		}
		return bbox;
	}


}

Layout.prototype.types['tile_images'] = (url, type, options) => { return new LayoutTileImages(url, type, options); };

export { LayoutTileImages }
