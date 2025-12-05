import '@testing-library/jest-dom';

// Mock EventSource for SSE tests
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  close() {
    const index = MockEventSource.instances.indexOf(this);
    if (index > -1) {
      MockEventSource.instances.splice(index, 1);
    }
  }

  // Test helper to emit events
  emit(type: string, data: unknown) {
    const listeners = this.listeners.get(type) || [];
    listeners.forEach(listener => {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    });
  }
}

// @ts-expect-error - mocking global EventSource
global.EventSource = MockEventSource;

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});
