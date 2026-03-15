'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatAmount, formatDate, formatFiscalYear, getDocTypeLabel, CATEGORIES, getFiscalYear, getFiscalMonth, extractDateFromOCR, extractAmountFromOCR, extractVendorFromOCR } from '@/lib/utils';

type Receipt = {
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
  created_at: string;
};

type YearStats = {
  year: number;
  total: number;
  count: number;
  months: { month: number; total: number; count: number }[];
};

export default function Home() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [stats, setStats] = useState<YearStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // フィルタ
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [docType, setDocType] = useState('all');
  const [search, setSearch] = useState('');

  // 編集モーダル
  const [editReceipt, setEditReceipt] = useState<Receipt | null>(null);
  const [editForm, setEditForm] = useState<Partial<Receipt>>({});

  // ビューワ
  const [viewImage, setViewImage] = useState<string | null>(null);

  // タブ
  const [tab, setTab] = useState<'list' | 'folders'>('list');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fiscalYear) params.set('fiscal_year', String(fiscalYear));
    if (month) params.set('month', String(month));
    if (docType !== 'all') params.set('doc_type', docType);
    if (search) params.set('search', search);
    const res = await fetch(`/api/receipts?${params}`);
    const data = await res.json();
    setReceipts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [fiscalYear, month, docType, search]);

  const fetchStats = async () => {
    const res = await fetch('/api/stats');
    const data = await res.json();
    setStats(data.years || []);
  };

  useEffect(() => {
    fetchReceipts();
    fetchStats();
  }, [fetchReceipts]);

  // OCR処理
  const runOCR = async (file: File): Promise<{ date: string | null; amount: number | null; vendor: string | null; raw: string }> => {
    setOcrProcessing(true);
    try {
      const Tesseract = await import('tesseract.js');
      const { data } = await Tesseract.recognize(file, 'jpn+eng', {});
      const text = data.text;
      return {
        date: extractDateFromOCR(text),
        amount: extractAmountFromOCR(text),
        vendor: extractVendorFromOCR(text),
        raw: text,
      };
    } catch {
      return { date: null, amount: null, vendor: null, raw: '' };
    } finally {
      setOcrProcessing(false);
    }
  };

  // ファイルアップロード処理
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        // 1. ファイルアップロード
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error);

        // 2. OCR（画像ファイルのみ）
        let ocrResult = { date: null as string | null, amount: null as number | null, vendor: null as string | null, raw: '' };
        if (file.type.startsWith('image/')) {
          ocrResult = await runOCR(file);
        }

        // 3. 日付決定（OCR結果 or 今日）
        const receiptDate = ocrResult.date || new Date().toISOString().split('T')[0];
        const fy = getFiscalYear(receiptDate);
        const fm = getFiscalMonth(receiptDate);

        // 4. レコード作成
        const receiptData = {
          doc_type: file.name.toLowerCase().includes('請求') || file.name.toLowerCase().includes('invoice') ? 'invoice' : 'receipt',
          title: file.name.replace(/\.[^.]+$/, ''),
          vendor: ocrResult.vendor,
          amount: ocrResult.amount,
          receipt_date: receiptDate,
          fiscal_year: fy,
          fiscal_month: fm,
          file_url: uploadData.file_url,
          file_name: uploadData.file_name,
          file_type: uploadData.file_type,
          ocr_raw: ocrResult.raw || null,
        };

        const res = await fetch('/api/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(receiptData),
        });
        if (!res.ok) throw new Error('保存失敗');

        showToast(`${file.name} をアップロードしました`);
      } catch (e) {
        showToast(`${file.name}: ${e instanceof Error ? e.message : 'エラー'}`, 'error');
      }
    }

    setUploading(false);
    fetchReceipts();
    fetchStats();
  };

  // ドラッグ&ドロップ
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // 編集保存
  const handleSaveEdit = async () => {
    if (!editReceipt) return;
    const receiptDate = editForm.receipt_date || editReceipt.receipt_date;
    const updates = {
      id: editReceipt.id,
      ...editForm,
      fiscal_year: receiptDate ? getFiscalYear(receiptDate) : editReceipt.fiscal_year,
      fiscal_month: receiptDate ? getFiscalMonth(receiptDate) : editReceipt.fiscal_month,
    };
    const res = await fetch('/api/receipts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setEditReceipt(null);
      showToast('更新しました');
      fetchReceipts();
      fetchStats();
    } else {
      showToast('更新に失敗しました', 'error');
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm('この書類を削除しますか？')) return;
    const res = await fetch(`/api/receipts?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('削除しました');
      fetchReceipts();
      fetchStats();
    }
  };

  // 年度の選択肢
  const currentFY = getFiscalYear(new Date().toISOString().split('T')[0]);
  const yearOptions = stats.length > 0
    ? stats.map(s => s.year)
    : [currentFY, currentFY - 1, currentFY - 2];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* トースト */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'
        }`}>
          {toast.text}
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">レシート管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
          >
            撮影
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-medium"
          >
            ファイル選択
          </button>
        </div>
      </div>

      {/* 隠しinput */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* ドラッグ&ドロップエリア */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center mb-6 transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
        }`}
      >
        {uploading || ocrProcessing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-500">
              {ocrProcessing ? 'OCR読み取り中...' : 'アップロード中...'}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500 text-sm">
              写真・PDFをドラッグ&ドロップ、または上のボタンから追加
            </p>
            <p className="text-gray-400 text-xs mt-1">
              画像は自動でOCR読み取り（日付・金額・発行元）
            </p>
          </div>
        )}
      </div>

      {/* タブ切り替え */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
        <button
          onClick={() => setTab('list')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
            tab === 'list' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
          }`}
        >
          一覧
        </button>
        <button
          onClick={() => setTab('folders')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
            tab === 'folders' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
          }`}
        >
          年度別フォルダ
        </button>
      </div>

      {tab === 'folders' ? (
        /* 年度別フォルダビュー */
        <div className="space-y-4">
          {stats.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border">
              まだデータがありません
            </div>
          ) : (
            stats.map((yearData) => (
              <div key={yearData.year} className="bg-white rounded-xl border overflow-hidden">
                <button
                  onClick={() => {
                    setFiscalYear(yearData.year);
                    setMonth(null);
                    setTab('list');
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="text-left">
                    <div className="font-bold text-gray-800">{formatFiscalYear(yearData.year)}</div>
                    <div className="text-sm text-gray-500">{yearData.count}件 / {formatAmount(yearData.total)}</div>
                  </div>
                  <span className="text-gray-400">&#8250;</span>
                </button>
                <div className="border-t divide-y">
                  {yearData.months.map((m) => (
                    <button
                      key={m.month}
                      onClick={() => {
                        setFiscalYear(yearData.year);
                        setMonth(m.month);
                        setTab('list');
                      }}
                      className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 text-sm"
                    >
                      <span className="text-gray-700">{m.month}月</span>
                      <span className="text-gray-500">{m.count}件 / {formatAmount(m.total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* 一覧ビュー */
        <>
          {/* フィルタ */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={fiscalYear ?? ''}
              onChange={(e) => { setFiscalYear(e.target.value ? parseInt(e.target.value) : null); setMonth(null); }}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">全年度</option>
              {Array.from(new Set(yearOptions)).map((y) => (
                <option key={y} value={y}>{formatFiscalYear(y).split('（')[0]}</option>
              ))}
            </select>
            {fiscalYear && (
              <select
                value={month ?? ''}
                onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="border rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">全月</option>
                {[4,5,6,7,8,9,10,11,12,1,2,3].map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            )}
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">全種類</option>
              <option value="receipt">領収書</option>
              <option value="invoice">請求書</option>
            </select>
            <input
              type="text"
              placeholder="検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white flex-1 min-w-[120px]"
            />
          </div>

          {/* フィルタクリア */}
          {(fiscalYear || month || docType !== 'all' || search) && (
            <button
              onClick={() => { setFiscalYear(null); setMonth(null); setDocType('all'); setSearch(''); }}
              className="text-sm text-blue-600 mb-3 hover:underline"
            >
              フィルタをクリア
            </button>
          )}

          {/* 件数 */}
          <div className="text-sm text-gray-500 mb-3">
            {receipts.length}件
            {fiscalYear && ` / ${formatFiscalYear(fiscalYear).split('（')[0]}`}
            {month && ` ${month}月`}
          </div>

          {/* リスト */}
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
            </div>
          ) : receipts.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border">
              書類がありません
            </div>
          ) : (
            <div className="space-y-3">
              {receipts.map((r) => (
                <div key={r.id} className="bg-white rounded-xl shadow-sm border p-4">
                  <div className="flex gap-3">
                    {/* サムネイル */}
                    {r.file_url && r.file_type?.startsWith('image/') && (
                      <button
                        onClick={() => setViewImage(r.file_url)}
                        className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img src={r.file_url} alt="" className="w-full h-full object-cover" />
                      </button>
                    )}
                    {r.file_url && r.file_type === 'application/pdf' && (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 w-16 h-16 rounded-lg bg-red-50 flex items-center justify-center text-red-500 text-xs font-bold"
                      >
                        PDF
                      </a>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            r.doc_type === 'invoice' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {getDocTypeLabel(r.doc_type)}
                          </span>
                          {r.category && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 ml-1">
                              {r.category}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-gray-800">{formatAmount(r.amount)}</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-sm font-medium text-gray-700">{r.vendor || r.title || r.file_name}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {formatDate(r.receipt_date)}
                        {r.notes && <span className="ml-2">{r.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => { setEditReceipt(r); setEditForm({ ...r }); }}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      編集
                    </button>
                    {r.file_url && (
                      <a
                        href={r.file_url}
                        download={r.file_name}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        DL
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 ml-auto"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 編集モーダル */}
      {editReceipt && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center" onClick={() => setEditReceipt(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">書類を編集</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">種類</label>
                  <select
                    value={editForm.doc_type || 'receipt'}
                    onChange={(e) => setEditForm({ ...editForm, doc_type: e.target.value as 'receipt' | 'invoice' })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="receipt">領収書</option>
                    <option value="invoice">請求書</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">日付</label>
                  <input
                    type="date"
                    value={editForm.receipt_date || ''}
                    onChange={(e) => setEditForm({ ...editForm, receipt_date: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">発行元</label>
                <input
                  type="text"
                  value={editForm.vendor || ''}
                  onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">金額</label>
                  <input
                    type="number"
                    value={editForm.amount ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">カテゴリ</label>
                  <select
                    value={editForm.category || ''}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value || null })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">未分類</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">メモ</label>
                <input
                  type="text"
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value || null })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSaveEdit} className="flex-1 bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium">
                保存
              </button>
              <button onClick={() => setEditReceipt(null)} className="flex-1 border py-2.5 rounded-lg text-sm">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 画像ビューワ */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={() => setViewImage(null)}>
          <button className="absolute top-4 right-4 text-white text-3xl" onClick={() => setViewImage(null)}>
            &times;
          </button>
          <img src={viewImage} alt="" className="max-w-full max-h-full object-contain p-4" />
        </div>
      )}
    </div>
  );
}
