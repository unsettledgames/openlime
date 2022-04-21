import { BoundingBox } from './BoundingBox.js'

/** 
 * An annotation is a decoration (text, graphics element, glyph) to be drawn in an overlay mode on the canvas.
 * Its purpose is to provide additional information useful for the interpretation of the underlying drawings. 
 * This calls defines the content of an annotation which is represented by its unique identifier and additional 
 * information (such as description, annotation category or class, drawing style, labels, etc.).
 */
class Annotation {
	/**
	 * Instantiates an **Annotation** object. An object literal with Annotation `options` can be specified.
	 * Note that the developer is free to define additional elements characterizing a custom annotation by adding new options to the constructor.
	 * @param {Object} [options] An object literal with Annotation options (freely adjustable).
	 * @param {string} options.label A string containing an annotation label.
	 * @param {string} option.description A HTML text containg a comprehensive description of the annotation.
	 * @param {string} option.class A class or category to cluster annotations.
	 */
	constructor(options) {
		Object.assign(
			this, 
			{
				id: Annotation.UUID(),
				code: null,
				label: null,
				description: null,
				class: null,
				target: null,
				svg: null,
				data: {},
				style: null,
				bbox: null,
				visible: true,
				camera: { 'x': 0, 'y': 0, 'z': 1 }, //FIXME State variables to be added to server
				light: { 'x': 0.5, 'y': 0.5 }, //FIXME State variables to be added to server

				ready: false, //already: convertted to svg
				needsUpdate: true,
				editing: false,
			}, 
			options);
			//TODO label as null is problematic, sort this issue.
			if(!this.label) this.label = ''; 
			this.elements = []; //assign options is not recursive!!!
	}

	/** @ignore */
	static UUID() {
		return 'axxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	/**
	 * Gets the bounding box of the annotation.
	 * Note that the coordinates for annotations are always relative to the top left corner of the canvas.
	 * @returns {BoundingBox} The bounding box
	 */
	getBBoxFromElements() {
		let box = { x: 0, y: 0, width: 0, height: 0 }
		if(!this.elements.length)
			return box;
		let { x, y, width, height } = this.elements[0].getBBox();
		for(let shape of this.elements) {
				const { sx, sy, swidth, sheight } = shape.getBBox();
				x = Math.min(x, sx);
				y = Math.min(x, sy);
				width = Math.max(width + x, sx + swidth) - x; 
				height = Math.max(height + y, sy + sheight) - y; 
		}
		return new BoundingBox({xLow: x, yLow: y, xHigh: x+width, yHigh: y+width});
	}

	/////////////////////////////////
	/* The class also provides functions for importing and exporting from and to files in JSON format. */
	/*
	 * Copies an entry of a JSON file into an **Annotation** object.
	 * @param {string} entry A JSON string representing an annotation.
	 * @returns {Annotation} The annotation.
	 */
	/** @ignore */
	static fromJsonLd(entry) {
		if(entry.type != 'Annotation')
			throw "Not a jsonld annotation.";
		let options = {id: entry.id};

		let rename = { 'identifying': 'code', 'identifying': 'label', 'describing': 'description', 'classifying':'class' };
		for(let item of entry.body) {
			let field = rename[item.purpose];
			if(field)
				options[field] = item.value;
		}
		let selector = entry.target && entry.target.selector;
		if(selector) {
			switch(selector.type) {
			case 'SvgSelector':
				options.svg = selector.value;
				options.elements = [];
				break;
			default:
				throw "Unsupported selector: " + selector.type;
			}
		}
		return new Annotation(options);
	}
	/*
	 * Exports an Annotation to a JSON entry
	 */
	/** @ignore */
	toJsonLd() {
		let body = [];
		if(this.code !== null)
			body.push( { type: 'TextualBody', value: this.code, purpose: 'indentifying' });
		if(this.class !== null)
			body.push( { type: 'TextualBody', value: this.class, purpose: 'classifying' });
		if(this.description !== null)
			body.push( { type: 'TextualBody', value: this.description, purpose: 'describing' });

		let obj = {
			"@context": "http://www.w3.org/ns/anno.jsonld",
			id: this.id,
			type: "Annotation",
			body: body,
			target: { selector: {} }
		}
		if(this.target)
			target.selector.source = this.target;


		if(this.element) {
			var s = new XMLSerializer();
			obj.target.selector.type = 'SvgSelector';
			obj.target.selector.value = s.serializeToString(this.element);
		}
	}
}

export { Annotation }