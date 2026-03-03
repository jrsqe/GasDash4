import DashboardClient from './components/DashboardClient'

// Page just renders the shell; data is fetched client-side via the API route
// so the interval/date controls work without a full page reload.
export default function Home() {
  return (
    <main style={{ position: 'relative', zIndex: 1 }}>
      <DashboardClient />
    </main>
  )
}
