/**
 * Manages handles simultaneous events from a target. 
 * how do I write more substantial documentation.
 *
 * @param {div} target is the DOM element from which the events are generated
 * @param {object} options is a JSON describing the options
 *  * **diagonal**: default *27*, the screen diagonal in inch
 */
class PointerManager {
    constructor(target, options) {

        this.target = target;

        Object.assign(this, {
            diagonal: 27 // Standard monitor 27"
        });

        if (options)
            Object.assign(this, options);

        this.currentPointers = [];
        this.eventObservers = new Map();
        this.ppmm = PointerManager.getPPMM(this.diagonal);

        this.target.style.touchAction = "none";
        this.target.addEventListener('pointerdown', (e) => this.handleEvent(e), false);
        document.addEventListener('pointermove', (e) => this.handleEvent(e), false);
        document.addEventListener('pointerup', (e) => this.handleEvent(e), false);
        document.addEventListener('pointercancel', (e) => this.handleEvent(e), false);
        this.target.addEventListener('wheel', (e) => this.handleEvent(e), false);
    }

    ///////////////////////////////////////////////////////////
    /// Constants
    static get ANYPOINTER() { return -1; }

    ///////////////////////////////////////////////////////////
    /// Utilities

    static splitStr(str) {
        return str.trim().split(/\s+/g);
    }

    static getPPMM(diagonal) {
        // sqrt(w^2 + h^2) / diagonal / 1in
        return Math.round(Math.sqrt(screen.width * screen.width + screen.height * screen.height) / diagonal / 25.4);
    }

    ///////////////////////////////////////////////////////////
    /// Class interface

    // register pointer handlers.
    on(eventTypes, obj, idx = PointerManager.ANYPOINTER) {
        eventTypes = PointerManager.splitStr(eventTypes);

        if (typeof (obj) == 'function') {
            obj = Object.fromEntries(eventTypes.map(e => [e,  obj]));
            obj.priority = -1000;
        }

        eventTypes.forEach(eventType => {
            if (idx == PointerManager.ANYPOINTER) {
                this.broadcastOn(eventType, obj);
            } else {
                const p = this.currentPointers[idx];
                if (!p) {
                    throw new Error("Bad Index");
                }
                p.on(eventType, obj);
            }
        });
        return obj;
    }


    // unregister pointer handlers
    off(eventTypes, callback, idx = PointerManager.ANYPOINTER) {
        if (idx == PointerManager.ANYPOINTER) {
            this.broadcastOff(eventTypes, callback);
        } else {
            PointerManager.splitStr(eventTypes).forEach(eventType => {
                const p = this.currentPointers[idx];
                if (!p) {
                    throw new Error("Bad Index");
                }
                p.off(eventType, callback);
            });
        }
    }

    onEvent(handler) {
        const cb_properties = ['fingerHover', 'fingerSingleTap', 'fingerDoubleTap', 'fingerHold', 'mouseWheel'];
        if (!handler.hasOwnProperty('priority'))
            throw new Error("Event handler has not priority property");

        if (!cb_properties.some((e) => typeof (handler[e]) == 'function'))
            throw new Error("Event handler properties are wrong or missing");

        for (let e of cb_properties)
            if (typeof (handler[e]) == 'function') {
                this.on(e, handler);
            }
    }

    onPan(handler) {
        const cb_properties = ['panStart', 'panMove', 'panEnd'];
        if (!handler.hasOwnProperty('priority'))
            throw new Error("Event handler has not priority property");

        if (!cb_properties.every((e) => typeof (handler[e]) == 'function'))
            throw new Error("Pan handler is missing one of this functions: panStart, panMove or panEnd");

        this.on('fingerMovingStart', (e) => {
            if (handler.panStart(e)) {
                this.on('fingerMoving', (e) => {
                    handler.panMove(e);
                }, e.idx);
                this.on('fingerMovingEnd', (e) => {
                    handler.panEnd(e);
                }, e.idx);
            }
        });
    }


    ///////////////////////////////////////////////////////////
    /// Implementation stuff

    // register broadcast handlers
    broadcastOn(eventType, obj) {
        const handlers = this.eventObservers.get(eventType);
        if (handlers)
            handlers.push(obj);
        else
            this.eventObservers.set(eventType, [obj]);
    }

    // unregister broadcast handlers
    broadcastOff(eventTypes, obj) {
        PointerManager.splitStr(eventTypes).forEach(eventType => {
            if (this.eventObservers.has(eventType)) {
                if (!obj) {
                    this.eventObservers.delete(eventType);
                } else {
                    const handlers = this.eventObservers.get(eventType);
                    const index = handlers.indexOf(obj);
                    if (index > -1) {
                        handlers.splice(index, 1);
                    }
                    if (handlers.length == 0) {
                        this.eventObservers.delete(eventType);
                    }
                }
            }
        });
    }

    // emit broadcast events
    broadcast(e) {
        if (!this.eventObservers.has(e.fingerType)) return;
        this.eventObservers.get(e.fingerType)
            .sort((a, b) => a.priority - b.priority)
            .every(obj => !obj[e.fingerType](e));  // the first obj returning true breaks the every loop
    }

    addCurrPointer(cp) {
        let result = -1;
        for (let i = 0; i < this.currentPointers.length && result < 0; i++) {
            if (this.currentPointers[i] == null) {
                result = i;
            }
        }
        if (result < 0) {
            this.currentPointers.push(cp);
            result = this.currentPointers.length - 1;
        } else {
            this.currentPointers[result] = cp;
        }

        return result;
    }

    removeCurrPointer(index) {
        this.currentPointers[index] = null;
        while ((this.currentPointers.length > 0) && (this.currentPointers[this.currentPointers.length - 1] == null)) {
            this.currentPointers.pop();
        }
    }

    handleEvent(e) {
        e.preventDefault();
        if (e.type == 'pointerdown') this.target.setPointerCapture(e.pointerId);
        if (e.type == 'pointercancel') console.log(e);
        e.timestamp = performance.now();

        let handled = false;
        for (let i = 0; i < this.currentPointers.length && !handled; i++) {
            const cp = this.currentPointers[i];
            if (cp) {
                handled = cp.handleEvent(e);
                if (cp.isDone())
                    this.removeCurrPointer(i);
            }
        }
        if (!handled) {
            const cp = new SinglePointerHandler(this, e.pointerId, { ppmm: this.ppmm });
            handled = cp.handleEvent(e);
        }
    }

}



class SinglePointerHandler {
    constructor(parent, pointerId, options) {

        this.parent = parent;
        this.pointerId = pointerId;

        Object.assign(this, {
            ppmm: 3, // 27in screen 1920x1080 = 3 ppmm
        });
        if (options)
            Object.assign(this, options);

        this.eventHistory = new CircularBuffer(10);
        this.isActive = false;
        this.startTap = 0;
        this.threshold = 15; // 15mm

        this.eventObservers = new Map();
        this.isDown = false;
        this.done = false;

        this.stateEnum = {
            IDLE: 0,
            DETECT: 1,
            HOVER: 2,
            MOVING_START: 3,
            MOVING: 4,
            MOVING_END: 5,
            HOLD: 6,
            TAPS_DETECT: 7,
            SINGLE_TAP: 8,
            DOUBLE_TAP_DETECT: 9,
            DOUBLE_TAP: 10,
        };
        this.status = this.stateEnum.IDLE;
        this.timeout = null;
        this.holdTimeoutThreshold = 600;
        this.tapTimeoutThreshold = 300;
        this.upDuration = 400;
        this.oldDownPos = { clientX: 0, clientY: 0 };
        this.movingThreshold = 5; // 5mm
        this.idx = this.parent.addCurrPointer(this);
    }

    ///////////////////////////////////////////////////////////
    /// Utilities

    static distance(x0, y0, x1, y1) {
        return Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    }

    distanceMM(x0, y0, x1, y1) {
        return SinglePointerHandler.distance(x0, y0, x1, y1) / this.ppmm;
    }

    ///////////////////////////////////////////////////////////
    /// Class interface

    on(eventType, obj) {
        this.eventObservers.set(eventType, obj);
    }

    off(eventType) {
        if (this.eventObservers.has(eventType)) {
            this.eventObservers.delete(eventType);
        }
    }

    ///////////////////////////////////////////////////////////
    /// Implementation stuff

    addToHistory(e) {
        this.eventHistory.push(e);
    }

    prevPointerEvent() {
        return this.eventHistory.last();
    }

    handlePointerDown(e) {
        this.startTap = e.timestamp;
    }

    handlePointerUp(e) {
        const tapDuration = e.timestamp - this.startTap;
    }

    isLikelySamePointer(e) {
        let result = this.pointerId == e.pointerId;
        if (!result && !this.isDown && e.type == "pointerdown") {
            const prevP = this.prevPointerEvent();
            if (prevP) {
                result = (e.pointerType == prevP.pointerType) && this.distanceMM(e.clientX, e.clientY, prevP.clientX, prevP.clientY) < this.threshold;
            }
        }
        return result;
    }

    // emit+broadcast
    emit(e) {
        let captured = false;
        if (this.eventObservers.has(e.fingerType)) {
            captured |= this.eventObservers.get(e.fingerType)[e.fingerType](e);
        }
        if (!captured)
            this.parent.broadcast(e);
    }

    // output Event, speed is computed only on pointermove
    createOutputEvent(e, type) {
        const result = e;
        result.fingerType = type;
        result.speedX = 0;
        result.speedY = 0;
        result.timestamp = performance.now();  //TODO: timestamp is already in the event, but which one we want on singleTap (delayed a bit)?
        const prevP = this.prevPointerEvent();
        if (prevP && (e.type == 'pointermove')) {
            const dt = result.timestamp - prevP.timestamp;
            if (dt > 0) {
                result.speedX = (result.clientX - prevP.clientX) / dt * 1000.0;  // px/s
                result.speedY = (result.clientY - prevP.clientY) / dt * 1000.0;  // px/s
            }
        }
        return result;
    }

    // Finite State Machine
    processEvent(e) {
        let distance = 0;
        if (e.type == "pointerdown") {
            this.oldDownPos.clientX = e.clientX;
            this.oldDownPos.clientY = e.clientY;
            this.isDown = true;
        }
        if (e.type == "pointerup" || e.type == "pointercancel") this.isDown = false;
        if (e.type == "pointermove" && this.isDown) {
            distance = this.distanceMM(e.clientX, e.clientY, this.oldDownPos.clientX, this.oldDownPos.clientY)
        }

        if (e.type == "wheel") {
            console.log("WHEEL");
            console.log(e);
            this.emit(this.createOutputEvent(e, 'mouseWheel'));
            return;
        }

        switch (this.status) {
            case this.stateEnum.HOVER:
            case this.stateEnum.IDLE:
                if (e.type == 'pointermove') {
                    this.emit(this.createOutputEvent(e, 'fingerHover'));
                    this.status = this.stateEnum.HOVER;
                } else if (e.type == 'pointerdown') {
                    this.status = this.stateEnum.DETECT;
                    this.timeout = setTimeout(() => {
                        this.status = this.stateEnum.IDLE;
                        this.emit(this.createOutputEvent(e, 'fingerHold'));
                    }, this.holdTimeoutThreshold);
                }
                break;
            case this.stateEnum.DETECT:
                if (e.type == 'pointercancel') { /// For Firefox
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerHold'));
                } else if (e.type == 'pointermove' && distance > this.movingThreshold) {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.MOVING;
                    const outEvent = this.createOutputEvent(e, 'fingerMovingStart');
                    this.emit(outEvent);
                } else if (e.type == 'pointerup') {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.TAPS_DETECT;
                    this.timeout = setTimeout(() => {
                        this.status = this.stateEnum.IDLE;
                        this.emit(this.createOutputEvent(e, 'fingerSingleTap'));
                    }, this.tapTimeoutThreshold);
                }
                break;
            case this.stateEnum.TAPS_DETECT:
                if (e.type == 'pointerdown') {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.DOUBLE_TAP_DETECT;
                    this.timeout = setTimeout(() => {
                        this.status = this.stateEnum.IDLE;
                        this.emit(this.createOutputEvent(e, 'fingerHold'));
                    }, this.tapTimeoutThreshold);
                } else if (e.type == 'pointermove' && distance > this.movingThreshold) {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerSingleTap'));
                    this.emit(this.createOutputEvent(e, 'fingerHover'));
                }
                break;
            case this.stateEnum.DOUBLE_TAP_DETECT:
                if (e.type == 'pointerup' || e.type == 'pointercancel') {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerDoubleTap'));
                }
                break;
            case this.stateEnum.DOUBLE_TAP_DETECT:
                if (e.type == 'pointermove' && distance > this.movingThreshold) {
                    this.status = this.stateEnum.MOVING;
                    this.emit(this.createOutputEvent(e, 'fingerMovingStart'));
                }
                break;
            case this.stateEnum.MOVING:
                if (e.type == 'pointermove') {
                    // Remain MOVING
                    const outEvent = this.createOutputEvent(e, 'fingerMoving');
                    this.emit(outEvent);
                } else if (e.type == 'pointerup' || e.type == 'pointercancel') {
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerMovingEnd'));
                }
                break;
            default:
                // console.log("ERROR " + this.status);
                // console.log(e);
                break;
        }

        this.addToHistory(e);
    }

    // updateInertia(t) {
    //     if (!this.inertialEvent)
    //         return true;
    //     let event = Object.assign({}, this.inertialEvent);
    //     let dt = (t - event.timestamp) / 1000;
    //     let K = 12;
    //     event.speedX = Math.exp(-dt * K) * this.inertialEvent.speedX;
    //     event.speedY = Math.exp(-dt * K) * this.inertialEvent.speedY;
    //     event.clientX = this.inertialEvent.clientX + this.inertialEvent.speedX / K * (1 - Math.exp(-dt * K));
    //     event.clientY = this.inertialEvent.clientY + this.inertialEvent.speedY / K * (1 - Math.exp(-dt * K));
    //     event.timestamp = t;
    //     const speed2 = event.speedX ** 2 + event.speedY ** 2;
    //     if (speed2 < this.inertialEndSpeed ** 2) {
    //         event.type = 'fingerInertialMovingEnd';
    //         this.status = this.stateEnum.IDLE;
    //         this.emit(event);
    //         this.inertialEvent = null;
    //         return true;
    //     } else {
    //         event.type = 'fingerInertialMoving';
    //         this.emit(event);
    //         return false;
    //     }
    // }

    handleEvent(e) {
        let result = false;
        if (this.isLikelySamePointer(e)) {
            this.pointerId = e.pointerId; //it's mine
            this.processEvent(e);
            result = true;
        }
        return result;
    }

    isDone() {
        return this.status == this.stateEnum.IDLE;
    }

}


class CircularBuffer {
    constructor(capacity) {
        if (typeof capacity != "number" || !Number.isInteger(capacity) || capacity < 1)
            throw new TypeError("Invalid capacity");
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.first = 0;
        this.size = 0;
    }

    clear() {
        this.first = 0;
        this.size = 0;
    }

    empty() {
        return this.size == 0;
    }

    size() {
        return this.size;
    }

    capacity() {
        return this.capacity;
    }

    first() {
        let result = null;
        if (this.size > 0) result = this.buffer[this.first];
        return result;
    }

    last() {
        let result = null;
        if (this.size > 0) result = this.buffer[(this.first + this.size - 1) % this.capacity];
        return result;
    }

    enqueue(v) {
        this.first = (this.first > 0) ? this.first - 1 : this.first = this.capacity - 1;
        this.buffer[this.first] = v;
        if (this.size < this.capacity) this.size++;
    }

    push(v) {
        if (this.size == this.capacity) {
            this.buffer[this.first] = v;
            this.first = (this.first + 1) % this.capacity;
        } else {
            this.buffer[(this.first + this.size) % this.capacity] = v;
            this.size++;
        }
    }

    dequeue() {
        if (this.size == 0) throw new RangeError("Dequeue on empty buffer");
        const v = this.buffer[(this.first + this.size - 1) % this.capacity];
        this.size--;
        return v;
    }

    pop() {
        return this.dequeue();
    }

    shift() {
        if (this.size == 0) throw new RangeError("Shift on empty buffer");
        const v = this.buffer[this.first];
        if (this.first == this.capacity - 1) this.first = 0; else this.first++;
        this.size--;
        return v;
    }

    get(start, end) {
        if (this.size == 0 && start == 0 && (end == undefined || end == 0)) return [];
        if (typeof start != "number" || !Number.isInteger(start) || start < 0) throw new TypeError("Invalid start value");
        if (start >= this.size) throw new RangeError("Start index past end of buffer: " + start);

        if (end == undefined) return this.buffer[(this.first + start) % this.capacity];

        if (typeof end != "number" || !Number.isInteger(end) || end < 0) throw new TypeError("Invalid end value");
        if (end >= this.size) throw new RangeError("End index past end of buffer: " + end);

        if (this.first + start >= this.capacity) {
            start -= this.capacity;
            end -= this.capacity;
        }
        if (this.first + end < this.capacity)
            return this.buffer.slice(this.first + start, this.first + end + 1);
        else
            return this.buffer.slice(this.first + start, this.capacity).concat(this.buffer.slice(0, this.first + end + 1 - this.capacity));
    }

    toarray() {
        if (this.size == 0) return [];
        return this.get(0, this.size - 1);
    }

}




export { PointerManager }