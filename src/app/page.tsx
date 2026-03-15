'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatAmount, formatDate, formatFiscalYear, getDocTypeLabel, getDocTypeColor, DOC_TYPES, CATEGORIES, getFiscalYear, getFiscalMonth, extractDateFromOCR, extractAmountFromOCR, extractVendorFromOCR } from '@/lib/utils';

type Receipt = {
  id: string;
  doc_type: string;
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
  const [exporting, setExporting] = useState(false);

  // フィルタ
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [docType, setDocType] = useState('all');
  const [search, setSearch] = useState('');

  // アップロード時の種類選択
  const [uploadDocType, setUploadDocType] = useState('receipt');

  // 編集モーダル
  const [editReceipt, setEditReceipt] = useState<Receipt | null>(null);
  const [editForm, setEditForm] = useState<Partial<Receipt>>({});

  // ビューワ
  const [viewImage, setViewImage] = useState<string | null>(null);

  // エクスポートモーダル
  const [exportModal, setExportModal] = useState<{ year: number; month: number } | null>(null);
  const [exportData, setExportData] = useState<{
    total_count: number;
    total_amount: number;
    types: { type: string; label: string; count: number; amount: number; files: { file_url: string; file_name: string }[] }[];
  } | null>(null);

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

        // 2. OCR（レシート・領収書の画像のみ）
        let ocrResult = { date: null as string | null, amount: null as number | null, vendor: null as string | null, raw: '' };
        if (file.type.startsWith('image/') && uploadDocType === 'receipt') {
          ocrResult = await runOCR(file);
        }

        // 3. 日付決定（OCR結果 or 今日）
        const receiptDate = ocrResult.date || new Date().toISOString().split('T')[0];
        const fy = getFiscalYear(receiptDate);
        const fm = getFiscalMonth(receiptDate);

        // 4. レコード作成
        const receiptData = {
          doc_type: uploadDocType,
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

        showToast(`${file.name} を保存しました`);
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

  // エクスポート（一括ダウンロード）
  const handleExport = async (year: number, m: number) => {
    setExportModal({ year, month: m });
    const res = await fetch(`/api/export?year=${year}&month=${m}`);
    const data = await res.json();
    setExportData(data);
  };

  // 全ファイル一括ダウンロード
  const handleDownloadAll = async () => {
    if (!exportData || !exportModal) return;
    setExporting(true);

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (const typeGroup of exportData.types) {
        const folder = zip.folder(typeGroup.label);
        if (!folder) continue;

        for (const file of typeGroup.files) {
          if (!file.file_url) continue;
          try {
            const res = await fetch(file.file_url);
            const blob = await res.blob();
            folder.file(file.file_name || `file_${file.file_url.split('/').pop()}`, blob);
          } catch {
            // skip failed downloads
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `経理データ_${exportModal.year}年${exportModal.month}月.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('ダウンロード完了');
    } catch {
      showToast('ダウンロードに失敗しました', 'error');
    } finally {
      setExporting(false);
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
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">経理データ管理</h1>
        <p className="text-xs text-gray-400 mt-1">レシート・クレカ明細・銀行明細を月別にまとめて管理</p>
      </div>

      {/* アップロード種類選択 + ボタン */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-gray-700">追加する種類:</span>
          <select
            value={uploadDocType}
            onChange={(e) => setUploadDocType(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-white flex-1"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 bg-blue-600 text-white px-3 py-2.5 rounded-lg text-sm font-medium"
          >
            撮影
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-gray-800 text-white px-3 py-2.5 rounded-lg text-sm font-medium"
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
        onChange={(e) => { handleFileUpload(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { handleFileUpload(e.target.files); e.target.value = ''; }}
      />

      {/* ドラッグ&ドロップエリア */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-5 text-center mb-5 transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'
        }`}
      >
        {uploading || ocrProcessing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-500">
              {ocrProcessing ? 'OCR読み取り中...' : 'アップロード中...'}
            </p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">
            ファイルをドラッグ&ドロップでも追加できます
          </p>
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
          月別まとめ
        </button>
      </div>

      {tab === 'folders' ? (
        /* 年度別・月別フォルダビュー */
        <div className="space-y-4">
          {stats.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400 border">
              まだデータがありません
            </div>
          ) : (
            stats.map((yearData) => (
              <div key={yearData.year} className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <div className="font-bold text-gray-800">{formatFiscalYear(yearData.year)}</div>
                  <div className="text-sm text-gray-500">{yearData.count}件 / {formatAmount(yearData.total)}</div>
                </div>
                <div className="divide-y">
                  {yearData.months.map((m) => (
                    <div key={m.month} className="px-4 py-3 flex items-center justify-between">
                      <button
                        onClick={() => {
                          setFiscalYear(yearData.year);
                          setMonth(m.month);
                          setTab('list');
                        }}
                        className="text-left flex-1"
                      >
                        <span className="text-gray-700 font-medium">{m.month}月</span>
                        <span className="text-gray-400 text-sm ml-2">{m.count}件 / {formatAmount(m.total)}</span>
                      </button>
                      <button
                        onClick={() => handleExport(yearData.year, m.month)}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg font-medium"
                      >
                        一括送付用
                      </button>
                    </div>
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
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white flex-1 min-w-[100px]"
            />
          </div>

          {(fiscalYear || month || docType !== 'all' || search) && (
            <button
              onClick={() => { setFiscalYear(null); setMonth(null); setDocType('all'); setSearch(''); }}
              className="text-sm text-blue-600 mb-3 hover:underline"
            >
              フィルタをクリア
            </button>
          )}

          <div className="text-sm text-gray-500 mb-3">
            {receipts.length}件
            {fiscalYear && ` / ${formatFiscalYear(fiscalYear).split('（')[0]}`}
            {month && ` ${month}月`}
          </div>

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
                    {r.file_url && r.file_type?.startsWith('image/') && (
                      <button
                        onClick={() => setViewImage(r.file_url)}
                        className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getDocTypeColor(r.doc_type)}`}>
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
                        <span className="text-sm font-medium text-gray-700 truncate block">{r.vendor || r.title || r.file_name}</span>
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
                    onChange={(e) => setEditForm({ ...editForm, doc_type: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    {DOC_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
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
                <label className="text-xs text-gray-500">発行元・名前</label>
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

      {/* エクスポートモーダル */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center" onClick={() => { setExportModal(null); setExportData(null); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">{exportModal.year}年{exportModal.month}月のデータ</h3>
            <p className="text-xs text-gray-400 mb-4">会計担当者に送るデータをまとめてダウンロード</p>

            {!exportData ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-gray-800"></div>
              </div>
            ) : exportData.total_count === 0 ? (
              <div className="text-center text-gray-400 py-8">この月のデータはありません</div>
            ) : (
              <>
                {/* 集計 */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">合計件数</span>
                    <span className="font-bold">{exportData.total_count}件</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">合計金額</span>
                    <span className="font-bold">{formatAmount(exportData.total_amount)}</span>
                  </div>
                </div>

                {/* 種類別の内訳 */}
                <div className="space-y-3 mb-5">
                  {exportData.types.map((t) => (
                    <div key={t.type} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${getDocTypeColor(t.type)}`}>
                          {t.label}
                        </span>
                        <span className="text-sm text-gray-600">{t.count}件 / {formatAmount(t.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ダウンロードボタン */}
                <button
                  onClick={handleDownloadAll}
                  disabled={exporting}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {exporting ? 'ZIPファイル作成中...' : 'ZIPでまとめてダウンロード'}
                </button>
                <p className="text-xs text-gray-400 text-center mt-2">
                  種類別フォルダに整理されたZIPファイルがダウンロードされます
                </p>
              </>
            )}

            <button
              onClick={() => { setExportModal(null); setExportData(null); }}
              className="w-full border py-2.5 rounded-lg text-sm mt-3"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 画像ビューワ */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={() => setViewImage(null)}>
          <button className="absolute top-4 right-4 text-white text-3xl" onClick={() => setViewImage(null)}>
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewImage} alt="" className="max-w-full max-h-full object-contain p-4" />
        </div>
      )}
    </div>
  );
}
