/// <reference lib="dom" />

import { mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register browser globals (document, window, fetch, etc.)
GlobalRegistrator.register();

// Mock IndexedDB (not provided by happy-dom)
const createMockObjectStore = () => ({
  get: mock(() => ({ onsuccess: null, onerror: null, result: undefined })),
  put: mock(() => ({ onsuccess: null, onerror: null })),
  delete: mock(() => ({ onsuccess: null, onerror: null })),
  getAll: mock(() => ({ onsuccess: null, onerror: null, result: [] })),
});

const createMockTransaction = () => ({
  objectStore: mock(() => createMockObjectStore()),
  oncomplete: null,
  onerror: null,
});

const createMockDatabase = () => ({
  objectStoreNames: {
    contains: mock(() => false),
  },
  createObjectStore: mock(() => createMockObjectStore()),
  transaction: mock(() => createMockTransaction()),
  close: mock(() => {}),
});

const mockIndexedDBOpen = mock(() => {
  const request = {
    result: createMockDatabase(),
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: Event) => void) | null,
  };

  // Simulate async success
  setTimeout(() => {
    if (request.onupgradeneeded) {
      request.onupgradeneeded(new Event("upgradeneeded"));
    }
    if (request.onsuccess) {
      request.onsuccess(new Event("success"));
    }
  }, 0);

  return request;
});

Object.defineProperty(globalThis, "indexedDB", {
  value: { open: mockIndexedDBOpen },
  writable: true,
  configurable: true,
});

// Mock EventSource (not provided by happy-dom)
class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readyState = MockEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate connection
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      if (this.onopen) {
        this.onopen(new Event("open"));
      }
    }, 0);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // Helper method for tests to simulate messages
  simulateMessage(data: string) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }

  // Helper method for tests to simulate errors
  simulateError() {
    this.readyState = MockEventSource.CLOSED;
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

Object.defineProperty(globalThis, "EventSource", {
  value: MockEventSource,
  writable: true,
  configurable: true,
});

// Export mocks for test access
export { MockEventSource, mockIndexedDBOpen };
