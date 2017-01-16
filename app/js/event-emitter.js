/*
    A basic emulation of the node.js EventEmitter class in ES6.
    https://nodejs.org/api/events.html
*/
class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }

    once(event, listener) {
        const runOnce = (...args) => {
            this.removeListener(event, runOnce);
            listener.apply(this, args);
        };
        this.on(event, runOnce);
    }

    emit(event, ...args) {
        if (!this.events[event]) {
            return;
        }
        for (let listener of this.events[event]) {
            const res = listener.apply(this, args);
            if (res || res === false) {
                return res;
            }
        }
    }

    removeListener(event, listener) {
        if (!this.events[event]) {
            return;
        }
        const index = this.events[event].indexOf(listener);
        if (index > -1) {
            this.events[event].splice(index, 1);
        }
    }
}
