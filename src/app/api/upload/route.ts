import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
  }

  const timestamp = Date.now();
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = `uploads/${fileName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from('receipts')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filePath);

  return NextResponse.json({
    file_url: urlData.publicUrl,
    file_name: file.name,
    file_type: file.type,
  });
}
