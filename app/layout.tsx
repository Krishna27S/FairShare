import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ToastContainer } from '@/components/toast-container'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'FairShare - Student Expense Splitting',
  description: 'Split expenses effortlessly with friends, roommates, and groups.',
}

export const viewport: Viewport = {
  themeColor: '#0d9668',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
        <ToastContainer />
      </body>
    </html>
  )
}
