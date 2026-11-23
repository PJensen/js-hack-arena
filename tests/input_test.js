import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { spellSlotFromKeyboardEvent } from '../public/src/input/InputRouter.js';

Deno.test('spell keyboard selection maps top-row and keypad digits to zero-based slots', () => {
  assertEquals(spellSlotFromKeyboardEvent({ key: '1', code: 'Digit1' }), 0);
  assertEquals(spellSlotFromKeyboardEvent({ key: '2', code: 'Digit2' }), 1);
  assertEquals(spellSlotFromKeyboardEvent({ key: '6', code: 'Numpad6' }), 5);
});

Deno.test('spell keyboard selection prefers physical key code and ignores unsupported keys', () => {
  assertEquals(spellSlotFromKeyboardEvent({ key: 'Unidentified', code: 'Digit3' }), 2);
  assertEquals(spellSlotFromKeyboardEvent({ key: '0', code: 'Digit0' }), null);
  assertEquals(spellSlotFromKeyboardEvent({ key: 'q', code: 'KeyQ' }), null);
});
