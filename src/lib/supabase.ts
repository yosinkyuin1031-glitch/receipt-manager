import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Receipt = {
  id: string;
  doc_type: 'receipt' | 'invoice';
  title: string | null;
  vendor: string | null;
  amount: number | null;
  receipt_date: string | null;
  fiscal_year: number | null;
  fiscal_month: number | null;
  category: string | null;
  notes: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  thumbnail_url: string | null;
  ocr_raw: string | null;
  created_at: string;
  updated_at: string;
};

// 日本の会計年度を計算（4月始まり）
export function getFiscalYear(date: Date): number {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  return month >= 4 ? year : year - 1;
}

export function getFiscalMonth(date: Date): number {
  return date.getMonth() + 1; // 1-12
}
