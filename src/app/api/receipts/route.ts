import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: 領収書一覧取得
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fiscalYear = searchParams.get('fiscal_year');
  const month = searchParams.get('month');
  const docType = searchParams.get('doc_type');
  const search = searchParams.get('search');

  let query = supabase.from('receipts').select('*').order('receipt_date', { ascending: false });

  if (fiscalYear) {
    query = query.eq('fiscal_year', parseInt(fiscalYear));
  }
  if (month) {
    query = query.eq('fiscal_month', parseInt(month));
  }
  if (docType && docType !== 'all') {
    query = query.eq('doc_type', docType);
  }
  if (search) {
    query = query.or(`vendor.ilike.%${search}%,title.ilike.%${search}%,notes.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: 領収書追加
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase.from('receipts').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT: 領収書更新
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('receipts').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: 領収書削除
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // ファイルも削除
  const { data: receipt } = await supabase.from('receipts').select('file_url').eq('id', id).single();
  if (receipt?.file_url) {
    const path = receipt.file_url.split('/receipts/')[1];
    if (path) await supabase.storage.from('receipts').remove([path]);
  }

  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
