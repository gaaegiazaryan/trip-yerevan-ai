import { EventBusService } from '../event-bus.service';
import { DomainEvent } from '../domain-event';
import { DomainEventHandler } from '../domain-event-handler.interface';

class TestEvent extends DomainEvent<{ value: number }> {
  constructor(value: number) {
    super('test.happened', { value });
  }
}

function createHandler(
  eventName: string,
  fn: (event: any) => Promise<void> = async () => {},
): DomainEventHandler {
  return { eventName, handle: jest.fn(fn) };
}

describe('EventBusService', () => {
  let bus: EventBusService;

  beforeEach(() => {
    bus = new EventBusService();
  });

  describe('publish', () => {
    it('should invoke matching handler', async () => {
      const handler = createHandler('test.happened');
      bus.register(handler);

      const event = new TestEvent(42);
      await bus.publish(event);

      expect(handler.handle).toHaveBeenCalledTimes(1);
      expect(handler.handle).toHaveBeenCalledWith(event);
    });

    it('should invoke multiple handlers for same event', async () => {
      const h1 = createHandler('test.happened');
      const h2 = createHandler('test.happened');
      bus.register(h1);
      bus.register(h2);

      await bus.publish(new TestEvent(1));

      expect(h1.handle).toHaveBeenCalledTimes(1);
      expect(h2.handle).toHaveBeenCalledTimes(1);
    });

    it('should NOT invoke handler for different event name', async () => {
      const handler = createHandler('other.happened');
      bus.register(handler);

      await bus.publish(new TestEvent(1));

      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('should isolate handler failures — other handlers still run', async () => {
      const failing = createHandler('test.happened', async () => {
        throw new Error('boom');
      });
      const passing = createHandler('test.happened');
      bus.register(failing);
      bus.register(passing);

      // Should not throw
      await bus.publish(new TestEvent(1));

      expect(failing.handle).toHaveBeenCalledTimes(1);
      expect(passing.handle).toHaveBeenCalledTimes(1);
    });

    it('should not throw when no handlers registered', async () => {
      await expect(bus.publish(new TestEvent(1))).resolves.toBeUndefined();
    });
  });

  describe('publishAll', () => {
    it('should publish events in order', async () => {
      const order: number[] = [];
      const handler = createHandler('test.happened', async (e: TestEvent) => {
        order.push(e.payload.value);
      });
      bus.register(handler);

      await bus.publishAll([new TestEvent(1), new TestEvent(2), new TestEvent(3)]);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('getRegisteredEvents', () => {
    it('should return empty array initially', () => {
      expect(bus.getRegisteredEvents()).toEqual([]);
    });

    it('should return registered event names', () => {
      bus.register(createHandler('test.happened'));
      bus.register(createHandler('other.happened'));

      expect(bus.getRegisteredEvents().sort()).toEqual([
        'other.happened',
        'test.happened',
      ]);
    });

    it('should not duplicate event names for multiple handlers', () => {
      bus.register(createHandler('test.happened'));
      bus.register(createHandler('test.happened'));

      expect(bus.getRegisteredEvents()).toEqual(['test.happened']);
    });
  });
});

describe('DomainEvent', () => {
  it('should have unique id per instance', () => {
    const a = new TestEvent(1);
    const b = new TestEvent(2);
    expect(a.id).not.toBe(b.id);
  });

  it('should set occurredAt to roughly now', () => {
    const before = Date.now();
    const event = new TestEvent(1);
    const after = Date.now();
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('should carry event name and payload', () => {
    const event = new TestEvent(42);
    expect(event.eventName).toBe('test.happened');
    expect(event.payload).toEqual({ value: 42 });
  });
});
