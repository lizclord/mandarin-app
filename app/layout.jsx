export const metadata = {
  title: 'Family Mandarin',
  description: 'Weekly Mandarin habit app',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#F7F3EE' }}>
        {children}
      </body>
    </html>
  )
}
