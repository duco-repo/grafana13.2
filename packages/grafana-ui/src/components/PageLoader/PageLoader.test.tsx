import { render, screen } from '@testing-library/react';

import { BrandingContext } from '../Branding/BrandingContext';

import { PageLoader } from './PageLoader';

describe('PageLoader', () => {
  it('renders the default GF Insight logo when no branding is provided', () => {
    render(<PageLoader />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'GF Insight' })).toBeInTheDocument();
  });

  it('renders the branded logo supplied via BrandingContext', () => {
    const AppLogo = () => <div data-testid="branded-logo" />;

    render(
      <BrandingContext.Provider value={{ AppLogo }}>
        <PageLoader />
      </BrandingContext.Provider>
    );

    expect(screen.getByTestId('branded-logo')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'GF Insight' })).not.toBeInTheDocument();
  });
});
