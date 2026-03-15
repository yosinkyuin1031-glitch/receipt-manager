import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const DOC_TYPE_FOLDERS: Record<string, string> = {
  receipt: 'レシート・領収書',
  invoice: '請求書',
  credit_card: 'クレジットカード明細',
  bank_statement: '銀行口座明細',
};

// GET: 月別データのエクスポート情報を取得
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (!year || !month) {
    return NextResponse.json({ error: 'year and month required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('fiscal_year', parseInt(year))
    .eq('fiscal_month', parseInt(month))
    .order('receipt_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 種類別に分類
  const grouped: Record<string, typeof data> = {};
  for (const r of data || []) {
    const type = r.doc_type || 'receipt';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(r);
  }

  // 集計
  const summary = {
    year: parseInt(year),
    month: parseInt(month),
    total_count: data?.length || 0,
    total_amount: data?.reduce((sum: number, r: { amount: number | null }) => sum + (r.amount || 0), 0) || 0,
    types: Object.entries(grouped).map(([type, items]) => ({
      type,
      label: DOC_TYPE_FOLDERS[type] || type,
      count: items.length,
      amount: items.reduce((sum, r) => sum + (r.amount || 0), 0),
      files: items.map(r => ({
        id: r.id,
        file_url: r.file_url,
        file_name: r.file_name,
        vendor: r.vendor,
        amount: r.amount,
        receipt_date: r.receipt_date,
      })),
    })),
  };

  return NextResponse.json(summary);
}
