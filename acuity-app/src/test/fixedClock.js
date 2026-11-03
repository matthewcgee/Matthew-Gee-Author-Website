import { vi } from 'vitest'

// The demo and sample data are generated relative to today's date, so the
// weekly pattern a test sees would otherwise change with the calendar. Pin the
// clock (Date only; timers stay real) so every run sees the same data.
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-21T12:00:00'))
