'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
type IntervalOption  = '5m' | '1h' | '1d'
type DateRangeOption = 'default' | '7d' | '3d' | '1d'

interface RegionData {
  facilities: string[]
  rows: Record<string, any>[]
  summary: {
    avgPrice: number | null; maxPrice: number | null; minPrice: number | null
    avgTotalGen: number | null; peakTotalGen: number | null; facilityCount: number
  }
}
interface Payload {
  ok: boolean; interval: string
  data: { NSW: RegionData; VIC: RegionData }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const FACILITY_COLOURS = [
  '#1D6FD4','#00A878','#E07B2A','#9B3FCF','#D4281D',
  '#0891B2','#65A30D','#B45309','#6D28D9','#0E7490',
  '#4D7C0F','#92400E','#5B21B6',
]
const PRICE_COLOUR = '#E07B2A'
const NAVY    = '#0B1F3A'
const TEAL    = '#00A878'
const MUTED   = '#7A8FA6'
const BORDER  = '#DDE2EA'
const SURFACE  = '#FFFFFF'
const SURFACE2 = '#F0F3F7'
const BG       = '#F4F6F9'

// ── Control options ───────────────────────────────────────────────────────────
const INTERVAL_OPTIONS: { value: IntervalOption; label: string }[] = [
  { value: '5m', label: '5 min' },
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
]
const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: 'default', label: 'All' },
  { value: '7d',      label: '7 days' },
  { value: '3d',      label: '3 days' },
  { value: '1d',      label: '1 day' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt      = (v: number | null, dec = 0) =>
  v == null ? '—' : v.toLocaleString('en-AU', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtPrice = (v: number | null) => v == null ? '—' : `$${fmt(v, 2)}`

function tickFormatter(val: string) {
  if (!val) return ''
  const [date, time] = val.split(' ')
  if (!date || !time) return val
  const [, mm, dd] = date.split('-')
  return `${dd}/${mm} ${time}`
}

/** Filter rows to only include the last N days based on the last timestamp in the data */
function filterByDateRange(rows: Record<string, any>[], dateRange: DateRangeOption) {
  if (dateRange === 'default' || rows.length === 0) return rows
  const days = dateRange === '7d' ? 7 : dateRange === '3d' ? 3 : 1
  // Use the latest timestamp in the data as the anchor (not wall-clock time,
  // since the API has a ~2 week lag)
  const lastTs  = rows[rows.length - 1].datetime as string
  const lastMs  = new Date(lastTs.replace(' ', 'T') + ':00+10:00').getTime()
  const startMs = lastMs - days * 24 * 3600 * 1000
  return rows.filter(row => {
    const ts = new Date((row.datetime as string).replace(' ', 'T') + ':00+10:00').getTime()
    return ts >= startMs
  })
}

/** Compute summary stats from a (potentially filtered) set of rows */
function computeSummary(rows: Record<string, any>[], facilities: string[]) {
  const priceVals = rows.map(r => r.price).filter((v): v is number => v != null)
  const totalGenPerRow = rows.map(row =>
    facilities.reduce((sum, f) => sum + (row[f] ?? 0), 0)
  ).filter(v => v > 0)

  return {
    avgPrice:      priceVals.length    ? priceVals.reduce((a, b) => a + b, 0) / priceVals.length : null,
    maxPrice:      priceVals.length    ? Math.max(...priceVals) : null,
    minPrice:      priceVals.length    ? Math.min(...priceVals) : null,
    avgTotalGen:   totalGenPerRow.length ? totalGenPerRow.reduce((a, b) => a + b, 0) / totalGenPerRow.length : null,
    peakTotalGen:  totalGenPerRow.length ? Math.max(...totalGenPerRow) : null,
    facilityCount: facilities.length,
  }
}

// ── Pill group ────────────────────────────────────────────────────────────────
function PillGroup<T extends string>({
  label, options, value, onChange, disabled,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ color: MUTED, fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{
        display: 'flex', background: SURFACE2,
        border: `1px solid ${BORDER}`, borderRadius: 8, padding: 2, gap: 2,
      }}>
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button key={opt.value} onClick={() => !disabled && onChange(opt.value)}
              disabled={disabled} style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'Inter, sans-serif', fontSize: '0.78rem',
                fontWeight: active ? 600 : 400,
                background: active ? NAVY : 'transparent',
                color: active ? '#fff' : MUTED,
                transition: 'all 0.15s', opacity: disabled ? 0.5 : 1,
              }}
            >{opt.label}</button>
          )
        })}
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div style={{ color: MUTED, fontSize: '0.68rem', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.5rem', fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: NAVY }}>
        {value}
      </div>
      {sub && <div style={{ color: MUTED, fontSize: '0.72rem', marginTop: '0.35rem', fontFamily: 'DM Mono, monospace' }}>{sub}</div>}
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '0.75rem 1rem', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace',
      minWidth: 210, boxShadow: '0 4px 16px rgba(11,31,58,0.10)',
    }}>
      <div style={{ color: MUTED, marginBottom: '0.5rem', fontSize: '0.68rem', fontWeight: 500 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: 3 }}>
          <span style={{ color: p.color, fontWeight: 500 }}>{p.name}</span>
          <span style={{ color: NAVY, fontWeight: 600 }}>
            {p.name === 'Spot Price ($/MWh)' ? `$${Number(p.value).toFixed(2)}` : `${Number(p.value).toFixed(1)} MW`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Region panel ──────────────────────────────────────────────────────────────
function RegionPanel({
  region, data, dateRange,
}: {
  region: 'NSW' | 'VIC'
  data: RegionData
  dateRange: DateRangeOption
}) {
  const [showTable, setShowTable] = useState(false)
  const { facilities } = data

  // Filter rows client-side — instant, no API call
  const visibleRows = useMemo(
    () => filterByDateRange(data.rows, dateRange),
    [data.rows, dateRange]
  )

  // Recompute summary stats from the visible window
  const summary = useMemo(
    () => computeSummary(visibleRows, facilities),
    [visibleRows, facilities]
  )

  const chartRows = visibleRows.length > 500 ? visibleRows.filter((_, i) => i % 2 === 0) : visibleRows

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: region === 'NSW' ? '#1D6FD4' : TEAL }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em', color: NAVY, margin: 0 }}>
          {region === 'NSW' ? 'New South Wales' : 'Victoria'}
        </h2>
        <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.72rem' }}>
          {summary.facilityCount} facilities · {visibleRows.length} intervals
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <StatCard label="Avg Spot Price"  value={fmtPrice(summary.avgPrice)}           sub="$/MWh" />
        <StatCard label="Max Spot Price"  value={fmtPrice(summary.maxPrice)}           sub="Peak interval" />
        <StatCard label="Min Spot Price"  value={fmtPrice(summary.minPrice)}           sub="Floor interval" />
        <StatCard label="Avg Generation"  value={`${fmt(summary.avgTotalGen, 0)} MW`}  sub="All facilities" />
        <StatCard label="Peak Generation" value={`${fmt(summary.peakTotalGen, 0)} MW`} sub="Max interval" />
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem', color: NAVY, margin: 0 }}>Gas Generation by Facility</h3>
          <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.7rem' }}>avg MW per interval</span>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartRows} margin={{ top: 5, right: 24, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
            <XAxis dataKey="datetime" tickFormatter={tickFormatter}
              tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }}
              tickLine={false} axisLine={{ stroke: BORDER }} interval="preserveStartEnd"
            />
            <YAxis yAxisId="gen"
              tick={{ fill: MUTED, fontSize: 10, fontFamily: 'DM Mono, monospace' }}
              tickLine={false} axisLine={false} width={58} tickFormatter={v => `${v} MW`}
            />
            <YAxis yAxisId="price" orientation="right"
              tick={{ fill: PRICE_COLOUR, fontSize: 10, fontFamily: 'DM Mono, monospace' }}
              tickLine={false} axisLine={false} width={62} tickFormatter={v => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '0.72rem', fontFamily: 'DM Mono, monospace', paddingTop: '0.75rem', color: NAVY }} />
            {facilities.map((name, i) => (
              <Line key={name} yAxisId="gen" type="monotone" dataKey={name}
                stroke={FACILITY_COLOURS[i % FACILITY_COLOURS.length]}
                strokeWidth={1.75} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls
              />
            ))}
            <Line yAxisId="price" type="monotone" dataKey="price" name="Spot Price ($/MWh)"
              stroke={PRICE_COLOUR} strokeWidth={1.25} strokeDasharray="5 3"
              dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <button onClick={() => setShowTable(v => !v)} style={{
          width: '100%', padding: '0.9rem 1.5rem', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer', color: NAVY,
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Raw Data Table</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.72rem', color: MUTED }}>
            {visibleRows.length} rows · {showTable ? '▲ hide' : '▼ show'}
          </span>
        </button>
        {showTable && (
          <div style={{ maxHeight: 380, overflowY: 'auto', borderTop: `1px solid ${BORDER}` }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datetime</th><th>Price $/MWh</th>
                  {facilities.map(f => <th key={f}>{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.datetime}</td>
                    <td>{row.price != null ? `$${Number(row.price).toFixed(2)}` : '—'}</td>
                    {facilities.map(f => (
                      <td key={f}>{row[f] != null ? Number(row[f]).toFixed(1) : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardClient() {
  const [activeTab, setActiveTab] = useState<'NSW' | 'VIC'>('NSW')
  const [interval,  setInterval]  = useState<IntervalOption>('1h')
  const [dateRange, setDateRange] = useState<DateRangeOption>('default')
  const [payload,   setPayload]   = useState<Payload | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetchData = useCallback(async (iv: IntervalOption) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/energy?interval=${iv}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setPayload(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData('1h') }, [])

  const handleInterval = (iv: IntervalOption) => {
    setInterval(iv)
    fetchData(iv)
  }

  const activeData = payload?.data?.[activeTab]

  return (
    <div style={{ minHeight: '100vh', background: BG }}>

      {/* Header */}
      <header style={{
        background: NAVY, borderBottom: `3px solid ${TEAL}`,
        position: 'sticky', top: 0, zIndex: 100,
        padding: '0 2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 58,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 6, background: TEAL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.8rem', color: NAVY, fontFamily: 'Inter, sans-serif',
            }}>SQ</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em', lineHeight: 1.1 }}>Gas Dashboard</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.65rem', fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>Squadron Energy</div>
            </div>
          </div>
          <div style={{
            fontFamily: 'DM Mono, monospace', fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.4)', padding: '2px 8px',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
          }}>NEM · Gas Peakers</div>
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>
          NSW & VIC
        </div>
      </header>

      {/* Controls bar */}
      <div style={{
        background: SURFACE, borderBottom: `1px solid ${BORDER}`,
        padding: '0 2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
        boxShadow: '0 1px 3px rgba(11,31,58,0.05)',
      }}>
        {/* Region tabs */}
        <div style={{ display: 'flex' }}>
          {(['NSW', 'VIC'] as const).map(tab => {
            const isActive = activeTab === tab
            const colour = tab === 'NSW' ? '#1D6FD4' : TEAL
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: '0.85rem 1.5rem', border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                fontWeight: isActive ? 600 : 400, fontSize: '0.875rem',
                color: isActive ? colour : MUTED,
                borderBottom: isActive ? `2px solid ${colour}` : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
              }}>
                {tab === 'NSW' ? 'New South Wales' : 'Victoria'}
              </button>
            )
          })}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0' }}>
          {loading && (
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.7rem', color: MUTED }}>
              Loading…
            </span>
          )}
          <PillGroup
            label="Interval"
            options={INTERVAL_OPTIONS}
            value={interval}
            onChange={handleInterval}
            disabled={loading}
          />
          {/* Range only filters existing data — no loading state needed */}
          <PillGroup
            label="Range"
            options={DATE_RANGE_OPTIONS}
            value={dateRange}
            onChange={setDateRange}
            disabled={false}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem' }}>
        {error ? (
          <div className="card" style={{ padding: '2rem', maxWidth: 480 }}>
            <div style={{ color: '#D4281D', fontFamily: 'DM Mono, monospace', fontSize: '0.78rem', marginBottom: '0.5rem', fontWeight: 600 }}>ERROR</div>
            <div style={{ color: MUTED, fontSize: '0.85rem' }}>{error}</div>
          </div>
        ) : loading && !payload ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '1rem' }}>
            <div style={{
              width: 36, height: 36, border: `3px solid ${BORDER}`,
              borderTopColor: TEAL, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.8rem' }}>Fetching data…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : activeData ? (
          <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <RegionPanel
              key={`${activeTab}-${interval}`}
              region={activeTab}
              data={activeData}
              dateRange={dateRange}
            />
          </div>
        ) : (
          <div style={{ color: MUTED, fontFamily: 'DM Mono, monospace', fontSize: '0.85rem', padding: '3rem 0' }}>
            No data for {activeTab}.
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${BORDER}`, background: SURFACE,
        padding: '0.9rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: TEAL }} />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: MUTED }}>
            Data: Open Electricity API · openelectricity.org.au
          </span>
        </div>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '0.68rem', color: MUTED }}>
          {payload ? `${interval} interval` : ''}
        </span>
      </footer>
    </div>
  )
}
