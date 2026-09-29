import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { makeTimeRange } from '@grafana/data';

import { TimePickerContentWithScreenSize } from './TimePickerContent';

describe('Global query time range limit', () => {
  const original = window.grafanaBootData.settings.queryMaxTimeRangeMs;

  beforeEach(() => {
    window.grafanaBootData.settings.queryMaxTimeRangeMs = 366 * 86_400_000;
  });
  afterEach(() => {
    window.grafanaBootData.settings.queryMaxTimeRangeMs = original;
  });

  function setup() {
    const onChange = jest.fn();
    render(
      <TimePickerContentWithScreenSize
        value={makeTimeRange('2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z')}
        onChange={onChange}
        onChangeTimeZone={jest.fn()}
        timeZone="utc"
        isFullscreen
      />
    );
    return onChange;
  }

  it('rejects an oversized absolute window and allows a historical leap year after correction', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('To'), '2025-01-01 00:00:00');
    await user.click(screen.getByRole('button', { name: 'Apply time range' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('at most 366 days');

    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2024-01-01 00:00:00');
    await user.click(screen.getByRole('button', { name: 'Apply time range' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects a custom relative quick range beyond the global limit', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    await user.type(screen.getByPlaceholderText('Search quick ranges'), '2y');
    await user.click(await screen.findByText('Last 2 years'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Older dates are allowed');
  });

  it('allows old data and preserves the disabled configuration', async () => {
    const user = userEvent.setup();
    const onChange = setup();
    await user.click(screen.getByRole('button', { name: 'Apply time range' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    window.grafanaBootData.settings.queryMaxTimeRangeMs = 0;
    await user.type(screen.getByPlaceholderText('Search quick ranges'), '2y');
    await user.click(await screen.findByText('Last 2 years'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
