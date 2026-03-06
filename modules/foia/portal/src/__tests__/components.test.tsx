import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSkeleton, Spinner } from '@/components/LoadingSkeleton';

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

describe('Header Component', () => {
  it('should render navigation links', () => {
    render(<Header />);
    
    expect(screen.getByText('FOIA Portal')).toBeInTheDocument();
    expect(screen.getByText('Submit Request')).toBeInTheDocument();
  });
});

describe('Footer Component', () => {
  it('should render footer sections', () => {
    render(<Footer />);
    
    expect(screen.getByText('About FOIA')).toBeInTheDocument();
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
  });
});

describe('Loading Components', () => {
  it('should render PageSkeleton', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('should render Spinner', () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
