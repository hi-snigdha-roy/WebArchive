import type { Metadata } from 'next';
import { Schibsted_Grotesk } from 'next/font/google';
import './globals.css';
import { THEME_SCRIPT } from '@/components/theme';
import { ToastProvider } from '@/components/toast';

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-schibsted',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Inspiration Archive',
  description: 'Sections of websites worth learning from, with their fonts, colours and notes.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${schibsted.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans text-15">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
