import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  // 年度別の集計
  const { data: receipts } = await supabase
    .from('receipts')
    .select('fiscal_year, fiscal_month, amount, doc_type')
    .order('fiscal_year', { ascending: false });

  if (!receipts) return NextResponse.json({ years: [] });

  const yearMap = new Map<number, { total: number; count: number; months: Map<number, { total: number; count: number }> }>();

  for (const r of receipts) {
    if (!r.fiscal_year) continue;
    if (!yearMap.has(r.fiscal_year)) {
      yearMap.set(r.fiscal_year, { total: 0, count: 0, months: new Map() });
    }
    const year = yearMap.get(r.fiscal_year)!;
    year.total += r.amount || 0;
    year.count += 1;

    if (r.fiscal_month) {
      if (!year.months.has(r.fiscal_month)) {
        year.months.set(r.fiscal_month, { total: 0, count: 0 });
      }
      const month = year.months.get(r.fiscal_month)!;
      month.total += r.amount || 0;
      month.count += 1;
    }
  }

  const years = Array.from(yearMap.entries()).map(([year, data]) => ({
    year,
    total: data.total,
    count: data.count,
    months: Array.from(data.months.entries())
      .map(([month, mData]) => ({ month, ...mData }))
      .sort((a, b) => a.month - b.month),
  })).sort((a, b) => b.year - a.year);

  return NextResponse.json({ years });
}
