// 日本の会計年度（4月始まり）
export function getFiscalYear(dateStr: string): number {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 4 ? year : year - 1;
}

export function getFiscalMonth(dateStr: string): number {
  return new Date(dateStr).getMonth() + 1;
}

// 年度表示（例: 令和7年度）
export function formatFiscalYear(year: number): string {
  const reiwa = year - 2018;
  return `令和${reiwa}年度（${year}年4月〜${year + 1}年3月）`;
}

// 金額フォーマット
export function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '未入力';
  return `¥${amount.toLocaleString()}`;
}

// 日付フォーマット
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '日付不明';
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// 月名
export function getMonthName(month: number): string {
  return `${month}月`;
}

// ドキュメントタイプラベル
export function getDocTypeLabel(type: string): string {
  return type === 'invoice' ? '請求書' : '領収書';
}

// カテゴリ一覧
export const CATEGORIES = [
  '交通費', '通信費', '消耗品費', '水道光熱費', '家賃',
  '広告宣伝費', '接待交際費', '外注費', '保険料', '雑費',
  '仕入', '給与', '福利厚生費', '修繕費', 'その他',
];

// OCRテキストから日付を抽出
export function extractDateFromOCR(text: string): string | null {
  // 2024年1月15日 or 2024/01/15 or 2024-01-15 or R6.1.15 etc.
  const patterns = [
    /(\d{4})\s*[年\/\-\.]\s*(\d{1,2})\s*[月\/\-\.]\s*(\d{1,2})\s*日?/,
    /令和\s*(\d{1,2})\s*[年\.]\s*(\d{1,2})\s*[月\.]\s*(\d{1,2})/,
    /R\s*(\d{1,2})\s*[\.\/]\s*(\d{1,2})\s*[\.\/]\s*(\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        const [, y, m, d] = match;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
        // 令和 or R
        const reiwa = parseInt(match[1]);
        const year = 2018 + reiwa;
        const m = match[2].padStart(2, '0');
        const d = match[3].padStart(2, '0');
        return `${year}-${m}-${d}`;
      }
    }
  }
  return null;
}

// OCRテキストから金額を抽出
export function extractAmountFromOCR(text: string): number | null {
  // ¥1,234 or ￥1,234 or 合計 1,234円 or 税込 1234
  const patterns = [
    /[¥￥]\s*([\d,]+)/,
    /(?:合計|税込|総額|請求金額|お支払|小計)\s*[：:]?\s*[¥￥]?\s*([\d,]+)/,
    /([\d,]+)\s*円/,
  ];

  let maxAmount = 0;
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseInt(match[1].replace(/,/g, ''));
      if (amount > maxAmount && amount < 100000000) {
        maxAmount = amount;
      }
    }
  }
  return maxAmount > 0 ? maxAmount : null;
}

// OCRテキストから発行元を抽出（最初の行を使う簡易版）
export function extractVendorFromOCR(text: string): string | null {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return null;
  // 最初の数行から会社名っぽいものを探す
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (trimmed.length >= 2 && trimmed.length <= 30 &&
        !trimmed.match(/^\d/) && !trimmed.match(/^[¥￥]/) &&
        !trimmed.match(/^(領収|請求|合計|小計|税|日付|伝票)/)) {
      return trimmed;
    }
  }
  return lines[0]?.trim().substring(0, 30) || null;
}
