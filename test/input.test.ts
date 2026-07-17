// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { Input } from '../src/game/Input.ts';

describe('Input editable targets', () => {
  it('does not block digits, movement keys or spaces inside a text input', () => {
    new Input(window);
    const input = document.createElement('input');
    document.body.append(input);

    for (const [code, key] of [['Digit1', '1'], ['KeyW', 'w'], ['Space', ' ']]) {
      const event = new KeyboardEvent('keydown', {
        code,
        key,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('still captures game keys outside editable controls', () => {
    new Input(window);
    const event = new KeyboardEvent('keydown', {
      code: 'Digit1',
      key: '1',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
