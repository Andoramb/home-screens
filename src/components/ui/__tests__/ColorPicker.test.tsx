// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import ColorPicker from '../ColorPicker';

function pick(value: string, hex: string) {
  const onChange = vi.fn();
  const { container } = render(<ColorPicker label="Background" value={value} onChange={onChange} />);
  fireEvent.change(container.querySelector('input[type="color"]')!, { target: { value: hex } });
  return onChange;
}

afterEach(cleanup);

describe('ColorPicker swatch pick', () => {
  it('lands solid when the colour was fully see-through', () => {
    expect(pick('transparent', '#3366ff')).toHaveBeenCalledWith('#3366ff');
    expect(pick('rgba(0, 0, 0, 0)', '#3366ff')).toHaveBeenCalledWith('#3366ff');
  });

  it('keeps a partial see-through amount', () => {
    expect(pick('rgba(0,0,0,0.5)', '#ff0000')).toHaveBeenCalledWith('rgba(255, 0, 0, 0.5)');
  });

  it('stays a plain hex for a solid colour', () => {
    expect(pick('#336699', '#ff0000')).toHaveBeenCalledWith('#ff0000');
  });
});
