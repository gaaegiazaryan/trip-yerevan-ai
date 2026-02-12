import { NotificationTemplateEngine } from '../notification-template.engine';

describe('NotificationTemplateEngine', () => {
  let engine: NotificationTemplateEngine;

  beforeEach(() => {
    engine = new NotificationTemplateEngine();
  });

  describe('register + has', () => {
    it('should register a template and report it exists', () => {
      engine.register({ key: 'test.tmpl', body: 'Hello {{name}}' });
      expect(engine.has('test.tmpl')).toBe(true);
      expect(engine.has('nonexistent')).toBe(false);
    });

    it('should register multiple templates via registerAll', () => {
      engine.registerAll([
        { key: 'a', body: 'A' },
        { key: 'b', body: 'B' },
      ]);
      expect(engine.getRegisteredKeys().sort()).toEqual(['a', 'b']);
    });
  });

  describe('render', () => {
    it('should interpolate variables in body', () => {
      engine.register({
        key: 'greeting',
        body: 'Hello {{name}}, your balance is {{amount}} {{currency}}.',
      });

      const result = engine.render('greeting', {
        name: 'Alice',
        amount: 100,
        currency: 'USD',
      });

      expect(result.templateKey).toBe('greeting');
      expect(result.text).toBe(
        'Hello Alice, your balance is 100 USD.',
      );
      expect(result.buttons).toBeUndefined();
    });

    it('should interpolate variables in buttons', () => {
      engine.register({
        key: 'action',
        body: 'Booking {{id}}',
        buttons: [
          { label: 'View {{id}}', callbackData: 'bk:view:{{id}}' },
        ],
      });

      const result = engine.render('action', { id: 'abc123' });

      expect(result.buttons).toEqual([
        { label: 'View abc123', callbackData: 'bk:view:abc123' },
      ]);
    });

    it('should keep unmatched variables as-is', () => {
      engine.register({
        key: 'partial',
        body: 'Hello {{name}}, your {{unknown}} is ready.',
      });

      const result = engine.render('partial', { name: 'Bob' });
      expect(result.text).toBe('Hello Bob, your {{unknown}} is ready.');
    });

    it('should throw for unknown template key', () => {
      expect(() => engine.render('nonexistent', {})).toThrow(
        'Notification template "nonexistent" not found',
      );
    });

    it('should handle numeric variables', () => {
      engine.register({ key: 'num', body: 'Price: {{price}}' });
      const result = engine.render('num', { price: 42 });
      expect(result.text).toBe('Price: 42');
    });

    it('should handle template with no variables', () => {
      engine.register({ key: 'static', body: 'No placeholders here.' });
      const result = engine.render('static', {});
      expect(result.text).toBe('No placeholders here.');
    });
  });

  describe('getRegisteredKeys', () => {
    it('should return empty array initially', () => {
      expect(engine.getRegisteredKeys()).toEqual([]);
    });

    it('should return all registered keys', () => {
      engine.register({ key: 'x', body: 'X' });
      engine.register({ key: 'y', body: 'Y' });
      expect(engine.getRegisteredKeys().sort()).toEqual(['x', 'y']);
    });
  });
});
