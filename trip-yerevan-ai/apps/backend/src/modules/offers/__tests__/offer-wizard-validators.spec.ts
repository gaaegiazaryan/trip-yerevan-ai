import {
  validatePrice,
  parsePrice,
  validateFutureDate,
  validateDate,
  validateDatePair,
  validatePositiveInt,
  validateListItem,
  validateListSize,
  parseListItems,
  validateHotelName,
  validateHotelDescription,
  validateAirline,
  validateFlightNumber,
  validateStringLength,
} from '../offer-wizard-validators';

describe('offer-wizard-validators', () => {
  // -------------------------------------------------------------------------
  // Price
  // -------------------------------------------------------------------------

  describe('validatePrice', () => {
    it('should accept a simple integer', () => {
      expect(validatePrice('1500')).toEqual({ valid: true });
    });

    it('should accept price with commas', () => {
      expect(validatePrice('2,500')).toEqual({ valid: true });
    });

    it('should accept price with spaces', () => {
      expect(validatePrice('1 500')).toEqual({ valid: true });
    });

    it('should reject zero', () => {
      const result = validatePrice('0');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('positive number');
    });

    it('should reject negative', () => {
      const result = validatePrice('-100');
      expect(result.valid).toBe(false);
    });

    it('should reject non-numeric', () => {
      const result = validatePrice('abc');
      expect(result.valid).toBe(false);
    });

    it('should reject extremely large price', () => {
      const result = validatePrice('99999999999');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should accept max valid price', () => {
      expect(validatePrice('999999999')).toEqual({ valid: true });
    });
  });

  describe('parsePrice', () => {
    it('should parse clean number', () => {
      expect(parsePrice('1500')).toBe(1500);
    });

    it('should strip commas and spaces', () => {
      expect(parsePrice('2,500')).toBe(2500);
      expect(parsePrice('1 500')).toBe(1500);
    });
  });

  // -------------------------------------------------------------------------
  // Dates
  // -------------------------------------------------------------------------

  describe('validateFutureDate', () => {
    it('should accept a future date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const result = validateFutureDate(future.toISOString().split('T')[0]);
      expect(result.valid).toBe(true);
    });

    it('should reject a past date', () => {
      const result = validateFutureDate('2020-01-01');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject invalid format', () => {
      const result = validateFutureDate('not-a-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('validateDate', () => {
    it('should accept YYYY-MM-DD', () => {
      expect(validateDate('2026-03-15')).toEqual({ valid: true });
    });

    it('should reject non-date string', () => {
      const result = validateDate('hello');
      expect(result.valid).toBe(false);
    });

    it('should reject MM-DD-YYYY format', () => {
      const result = validateDate('03-15-2026');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDatePair', () => {
    it('should accept return after departure', () => {
      const result = validateDatePair('2026-03-10', '2026-03-17');
      expect(result.valid).toBe(true);
    });

    it('should accept same date', () => {
      const result = validateDatePair('2026-03-10', '2026-03-10');
      expect(result.valid).toBe(true);
    });

    it('should reject return before departure', () => {
      const result = validateDatePair('2026-03-17', '2026-03-10');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('after');
    });
  });

  // -------------------------------------------------------------------------
  // Integer
  // -------------------------------------------------------------------------

  describe('validatePositiveInt', () => {
    it('should accept valid integer within range', () => {
      expect(validatePositiveInt('5', 1, 20, 'adults')).toEqual({ valid: true });
    });

    it('should reject decimal', () => {
      const result = validatePositiveInt('2.5', 1, 20, 'adults');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('whole number');
    });

    it('should reject below min', () => {
      const result = validatePositiveInt('0', 1, 20, 'adults');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between');
    });

    it('should reject above max', () => {
      const result = validatePositiveInt('21', 1, 20, 'adults');
      expect(result.valid).toBe(false);
    });

    it('should accept boundary values', () => {
      expect(validatePositiveInt('1', 1, 20, 'adults')).toEqual({ valid: true });
      expect(validatePositiveInt('20', 1, 20, 'adults')).toEqual({ valid: true });
    });

    it('should accept zero when min is 0', () => {
      expect(validatePositiveInt('0', 0, 20, 'children')).toEqual({ valid: true });
    });
  });

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  describe('validateListItem', () => {
    it('should accept normal text', () => {
      expect(validateListItem('Hotel breakfast')).toEqual({ valid: true });
    });

    it('should reject empty', () => {
      const result = validateListItem('');
      expect(result.valid).toBe(false);
    });

    it('should reject over 100 chars', () => {
      const result = validateListItem('A'.repeat(101));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('101/100');
    });
  });

  describe('validateListSize', () => {
    it('should allow adding when under limit', () => {
      expect(validateListSize(5)).toEqual({ valid: true });
    });

    it('should reject when at limit', () => {
      const result = validateListSize(20);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('20');
    });
  });

  describe('parseListItems', () => {
    it('should split comma-separated items', () => {
      expect(parseListItems('Hotel, Flight, Transfer')).toEqual([
        'Hotel',
        'Flight',
        'Transfer',
      ]);
    });

    it('should treat single text as one item', () => {
      expect(parseListItems('Hotel breakfast')).toEqual(['Hotel breakfast']);
    });

    it('should filter empty segments', () => {
      expect(parseListItems('Hotel,,Flight,')).toEqual(['Hotel', 'Flight']);
    });

    it('should return empty array for empty input', () => {
      expect(parseListItems('')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Hotel / Flight strings
  // -------------------------------------------------------------------------

  describe('validateHotelName', () => {
    it('should accept normal name', () => {
      expect(validateHotelName('Rixos Premium')).toEqual({ valid: true });
    });

    it('should reject empty', () => {
      expect(validateHotelName('').valid).toBe(false);
    });

    it('should reject over 200 chars', () => {
      expect(validateHotelName('A'.repeat(201)).valid).toBe(false);
    });
  });

  describe('validateHotelDescription', () => {
    it('should accept under 500 chars', () => {
      expect(validateHotelDescription('Nice hotel').valid).toBe(true);
    });

    it('should reject over 500 chars', () => {
      const result = validateHotelDescription('A'.repeat(501));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('501/500');
    });
  });

  describe('validateAirline', () => {
    it('should accept normal name', () => {
      expect(validateAirline('Emirates')).toEqual({ valid: true });
    });

    it('should reject empty', () => {
      expect(validateAirline('').valid).toBe(false);
    });
  });

  describe('validateFlightNumber', () => {
    it('should accept normal flight number', () => {
      expect(validateFlightNumber('EK 713')).toEqual({ valid: true });
    });

    it('should reject empty', () => {
      expect(validateFlightNumber('').valid).toBe(false);
    });

    it('should reject over 20 chars', () => {
      expect(validateFlightNumber('A'.repeat(21)).valid).toBe(false);
    });
  });

  describe('validateStringLength', () => {
    it('should accept within limit', () => {
      expect(validateStringLength('hello', 10, 'field')).toEqual({ valid: true });
    });

    it('should reject over limit', () => {
      const result = validateStringLength('A'.repeat(11), 10, 'field');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('11/10');
    });
  });
});
