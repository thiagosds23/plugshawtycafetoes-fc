import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// APIs do navegador que o jsdom não tem e que as telas (framer-motion, sons) usam
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; }
  });
}
class Observador { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
window.IntersectionObserver = window.IntersectionObserver || Observador;
window.ResizeObserver = window.ResizeObserver || Observador;
window.scrollTo = () => {};
window.AudioContext = window.AudioContext || class {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  resume() { return Promise.resolve(); }
  createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, type: 'sine' }; }
  createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} } }; }
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
